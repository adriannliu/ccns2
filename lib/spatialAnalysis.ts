import type { SafetyPlanSelection } from "@/lib/bedrockTool";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ImageFormat,
} from "@aws-sdk/client-bedrock-runtime";
import type { AnalyzeInput } from "@/lib/analyzeInput";
import {
  bboxIoU,
  isPlausibleDoorBBox,
  isPlausibleDropAndCoverBBox,
  isPlausibleSafeZoneBBox,
  normalizeBBox,
} from "@/lib/bbox";
import { SAFETY_PLAN_TOOL_CONFIG, extractToolInput } from "@/lib/bedrockTool";
import { composeMockSafetyPlan, composeSafetyPlan } from "@/lib/composeSafetyPlan";
import {
  formatDetectionsForPrompt,
  mockDetections,
  runObjectDetection,
  type SpatialDetection,
} from "@/lib/detection";
import { normalizeRoomModel } from "@/lib/roomModel";
import { contentTypeToImageFormat, s3Location } from "@/lib/s3";
import { SYSTEM_PROMPT_PHOTO, SYSTEM_PROMPT_VIDEO360 } from "@/lib/vlmPrompts";
import type { AnalysisResult, EgressPoint, Hazard, SafeZone, Scenario } from "@/lib/types";

const SCENARIO_INSTRUCTIONS: Record<Scenario, string> = {
  FIRE:
    "Scenario: FIRE. Select door/window detections for egress. Mark glass/fixtures as hazards. Cover = furniture only.",
  EARTHQUAKE:
    "Scenario: EARTHQUAKE. Drop & Cover = desk/table furniture detections only. Mark structure/fixtures/glass as hazards.",
  CODE_RED:
    "Scenario: CODE_RED. Hiding Spot = large furniture that could conceal (wardrobe, cabinet). Mark sightline hazards.",
};

const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ??
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";
const BEDROCK_FALLBACK_MODEL_ID =
  process.env.BEDROCK_FALLBACK_MODEL_ID ?? "us.amazon.nova-pro-v1:0";
const TEMPERATURE = 0.1;
const MAX_TOKENS_PHOTO = 2048;
const MAX_TOKENS_VIDEO = 4096;

export const ALL_SCENARIOS: Scenario[] = ["FIRE", "EARTHQUAKE", "CODE_RED"];

function hasAwsCredentials(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

function parseImage(image: string): { bytes: Uint8Array; format: ImageFormat } {
  let format: ImageFormat = "jpeg";
  let base64 = image;
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,(.*)$/i.exec(image);
  if (match) {
    const ext = match[1].toLowerCase();
    format = ext === "jpg" ? "jpeg" : (ext as ImageFormat);
    base64 = match[2];
  } else if (image.startsWith("data:")) {
    base64 = image.slice(image.indexOf(",") + 1);
  }
  return { bytes: new Uint8Array(Buffer.from(base64, "base64")), format };
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function toImageBlock(source: AnalyzeInput["sources"][number]): ContentBlock {
  if (source.kind === "s3") {
    return {
      image: {
        format: contentTypeToImageFormat(source.contentType),
        source: { s3Location: s3Location(source.key) },
      },
    };
  }
  const { bytes, format } = parseImage(source.image);
  return { image: { format, source: { bytes } } };
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    const parts = trimmed
      .split(/\r?\n+|(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length ? parts : [trimmed];
  }
  return [];
}

function normalizeEgressPoints(raw: EgressPoint[]): EgressPoint[] {
  const points = raw.filter((p) => {
    if (p.type === "Window") return true;
    return isPlausibleDoorBBox(p.coordinates);
  });

  const drop = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (bboxIoU(points[i].coordinates, points[j].coordinates) < 0.35) continue;
      const a = points[i];
      const b = points[j];
      if (a.type !== "Window" && b.type === "Window") drop.add(i);
      else if (b.type !== "Window" && a.type === "Window") drop.add(j);
      else if (a.type !== "Window" && b.type !== "Window") {
        if (a.type === "Primary Door" && b.type === "Secondary Door") drop.add(j);
        else if (b.type === "Primary Door" && a.type === "Secondary Door") drop.add(i);
        else drop.add(j);
      }
    }
  }
  return points.filter((_, i) => !drop.has(i));
}

const INVALID_SAFE_ZONE_TEXT =
  /\b(pillar|column|post|pole|beam|joist|rafter|truss|girder|soffit|ceiling|duct|aircon|air.?con|air.?condition|hvac|ventilation|exhaust|conduit|pipe|cable tray|sprinkler|structural|I-beam|concrete column|overhead|light fixture|mount(ed)?\s+(on|to)\s+(the\s+)?ceiling)\b/i;

const DROP_COVER_FURNITURE =
  /\b(desk|table|counter|workbench|credenza|workstation|island)\b/i;

function normalizeSafeZones(raw: SafeZone[]): SafeZone[] {
  return raw.filter((zone) => {
    const desc = zone.description ?? "";
    if (INVALID_SAFE_ZONE_TEXT.test(desc)) return false;
    if (zone.type === "Drop & Cover") {
      if (!isPlausibleDropAndCoverBBox(zone.coordinates)) return false;
      if (!DROP_COVER_FURNITURE.test(desc)) return false;
      return true;
    }
    return isPlausibleSafeZoneBBox(zone.coordinates);
  });
}

function normalizeResult(
  raw: Partial<AnalysisResult>,
  detections?: SpatialDetection[],
): AnalysisResult {
  const egress_points = normalizeEgressPoints(raw.egress_points ?? []);
  const safe_zones = normalizeSafeZones(raw.safe_zones ?? []);
  const hazards = raw.hazards ?? [];

  return {
    egress_points,
    hazards,
    safe_zones,
    actionable_instructions: toStringArray(raw.actionable_instructions),
    room_model: normalizeRoomModel(raw.room_model),
    detections,
    detection_sources: detections
      ? [...new Set(detections.map((d) => d.source))]
      : undefined,
  };
}

async function invokeReasoningModel(
  client: BedrockRuntimeClient,
  modelId: string,
  input: AnalyzeInput,
  scenario: Scenario,
  detections: SpatialDetection[],
): Promise<SafetyPlanSelection> {
  const isVideo = input.mode === "video360";
  const isMulti = input.sources.length > 1;
  const detectionBlock = formatDetectionsForPrompt(detections);

  const intro = isVideo
    ? `${SCENARIO_INSTRUCTIONS[scenario]}\n\n360° scan with ${input.sources.length} frames. Detections are from frame 1.\n\n${detectionBlock}`
    : isMulti
      ? `${SCENARIO_INSTRUCTIONS[scenario]}\n\nMultiple photos; detections from frame 1.\n\n${detectionBlock}`
      : `${SCENARIO_INSTRUCTIONS[scenario]}\n\n${detectionBlock}`;

  const content: ContentBlock[] = [
    { text: intro },
    ...(isVideo || isMulti
      ? input.sources.flatMap((src, i) => [
          { text: isVideo ? `Frame ${i + 1}:` : `Photo ${i + 1}:` },
          toImageBlock(src),
        ])
      : [toImageBlock(input.sources[0])]),
  ];

  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: isVideo ? SYSTEM_PROMPT_VIDEO360 : SYSTEM_PROMPT_PHOTO }],
      messages: [{ role: "user", content }],
      toolConfig: SAFETY_PLAN_TOOL_CONFIG,
      inferenceConfig: {
        temperature: TEMPERATURE,
        maxTokens: isVideo ? MAX_TOKENS_VIDEO : MAX_TOKENS_PHOTO,
      },
    }),
  );

  const blocks = response.output?.message?.content;
  const toolInput = extractToolInput(blocks);
  if (toolInput && typeof toolInput === "object") {
    return toolInput as SafetyPlanSelection;
  }

  const text = blocks?.find((c) => "text" in c)?.text;
  if (!text) throw new Error("Bedrock returned no usable tool or text output.");
  return extractJson(text) as SafetyPlanSelection;
}

function mockVideoRoomModel(scenario: Scenario): AnalysisResult["room_model"] {
  return {
    walls: [
      [[0.08, 0.08], [0.92, 0.08]],
      [[0.92, 0.08], [0.92, 0.92]],
      [[0.92, 0.92], [0.08, 0.92]],
      [[0.08, 0.92], [0.08, 0.08]],
    ],
    landmarks: [
      { label: "Main exit", type: "exit", position: [0.5, 0.08], detail: "Clear" },
      { label: "Desk", type: "safe_zone", position: [0.72, 0.62], detail: "Cover" },
      { label: "Glass shelf", type: "hazard", position: [0.28, 0.42] },
    ],
    scan_origin: [0.5, 0.78],
    exit_path:
      scenario === "EARTHQUAKE"
        ? [[0.5, 0.78], [0.72, 0.62]]
        : [[0.5, 0.78], [0.5, 0.4], [0.5, 0.12]],
  };
}

export async function runSpatialAnalysis(
  input: AnalyzeInput,
  scenario: Scenario,
): Promise<{ result: AnalysisResult; model: string }> {
  const overlaySource = input.sources[0];

  if (!hasAwsCredentials()) {
    const detections = mockDetections();
    const composed = composeMockSafetyPlan(detections, scenario);
    const result = normalizeResult(
      input.mode === "video360"
        ? { ...composed, room_model: mockVideoRoomModel(scenario) }
        : composed,
      detections,
    );
    return { result, model: "mock" };
  }

  const { detections, sources: detectionSources } =
    await runObjectDetection(overlaySource);

  if (detectionSources.length === 0) {
    console.warn("[spatialAnalysis] No detectors succeeded; proceeding with empty detections.");
  }

  const client = new BedrockRuntimeClient({ region: AWS_REGION });
  const candidates = [BEDROCK_MODEL_ID];
  if (BEDROCK_FALLBACK_MODEL_ID && BEDROCK_FALLBACK_MODEL_ID !== BEDROCK_MODEL_ID) {
    candidates.push(BEDROCK_FALLBACK_MODEL_ID);
  }

  let lastErr: unknown;
  for (const modelId of candidates) {
    try {
      const selection = await invokeReasoningModel(
        client,
        modelId,
        input,
        scenario,
        detections,
      );
      const composed = composeSafetyPlan(detections, selection);
      const result = normalizeResult(composed, detections);
      return { result, model: modelId };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All vision models failed.");
}
