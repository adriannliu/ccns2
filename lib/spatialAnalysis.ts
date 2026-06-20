import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ImageFormat,
} from "@aws-sdk/client-bedrock-runtime";
import type { AnalyzeInput } from "@/lib/analyzeInput";
import { normalizeBBox } from "@/lib/bbox";
import { SAFETY_PLAN_TOOL_CONFIG, extractToolInput } from "@/lib/bedrockTool";
import { normalizeRoomModel } from "@/lib/roomModel";
import { contentTypeToImageFormat, s3Location } from "@/lib/s3";
import { SYSTEM_PROMPT_PHOTO, SYSTEM_PROMPT_VIDEO360 } from "@/lib/vlmPrompts";
import type { AnalysisResult, EgressPoint, Hazard, SafeZone, Scenario } from "@/lib/types";

const SCENARIO_INSTRUCTIONS: Record<Scenario, string> = {
  FIRE: "Scenario: FIRE. Prioritize low, smoke-free egress and avoid flammable hazards.",
  EARTHQUAKE:
    "Scenario: EARTHQUAKE. Prioritize sturdy cover (safe zones) and flag falling hazards.",
  CODE_RED:
    "Scenario: CODE_RED. Prioritize concealment/hiding spots and lockable barriers; avoid line-of-sight to doors/windows.",
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

function pickArray(raw: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    if (Array.isArray(raw[key])) return raw[key] as unknown[];
  }
  return [];
}

/**
 * Coerce the model's instructions into a string[]. Some vision models (e.g.
 * the Nova fallback) return a single prose string instead of a JSON array,
 * which would otherwise crash the UI's `.map()`.
 */
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

function normalizeResult(raw: Partial<AnalysisResult>): AnalysisResult {
  const record = raw as Record<string, unknown>;
  const egressRaw = pickArray(record, ["egress_points", "egressPoints", "exits"]);
  const safeRaw = pickArray(record, ["safe_zones", "safeZones", "shelter"]);
  const hazardRaw = pickArray(record, ["hazards", "hazard_points"]);

  const egress_points = egressRaw
    .map((rawItem) => {
      const item = rawItem as Partial<EgressPoint>;
      const coordinates = normalizeBBox(item.coordinates);
      if (!coordinates) return null;
      return { ...item, coordinates } as EgressPoint;
    })
    .filter((item): item is EgressPoint => item !== null);

  const safe_zones = safeRaw
    .map((rawItem) => {
      const item = rawItem as Partial<SafeZone>;
      const coordinates = normalizeBBox(item.coordinates);
      if (!coordinates) return null;
      return { ...item, coordinates } as SafeZone;
    })
    .filter((item): item is SafeZone => item !== null);

  const hazards = hazardRaw
    .map((rawItem) => {
      const item = rawItem as Partial<Hazard>;
      const coordinates = normalizeBBox(item.coordinates);
      if (!coordinates) return null;
      return { ...item, coordinates } as Hazard;
    })
    .filter((item): item is Hazard => item !== null);

  return {
    egress_points,
    hazards,
    safe_zones,
    actionable_instructions: toStringArray(raw.actionable_instructions),
    room_model: normalizeRoomModel(raw.room_model),
  };
}

async function invokeModel(
  client: BedrockRuntimeClient,
  modelId: string,
  input: AnalyzeInput,
  scenario: Scenario,
): Promise<AnalysisResult> {
  const isVideo = input.mode === "video360";
  const isMulti = input.sources.length > 1;
  const intro = isVideo
    ? `${SCENARIO_INSTRUCTIONS[scenario]}\n\nThese ${input.sources.length} frames are a 360° room scan. Return room_model.`
    : isMulti
      ? `${SCENARIO_INSTRUCTIONS[scenario]}\n\nThese ${input.sources.length} photos are the same room from different angles.`
      : SCENARIO_INSTRUCTIONS[scenario];

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
      // Force structured output. Both Claude 3+ and Nova must return arguments
      // conforming to the tool schema — far more reliable than free-form JSON,
      // which Nova in particular mangles into prose/string lists.
      toolConfig: SAFETY_PLAN_TOOL_CONFIG,
      inferenceConfig: {
        temperature: TEMPERATURE,
        maxTokens: isVideo ? MAX_TOKENS_VIDEO : MAX_TOKENS_PHOTO,
      },
    }),
  );

  const blocks = response.output?.message?.content;

  // Preferred path: structured arguments from the forced tool call.
  const toolInput = extractToolInput(blocks);
  if (toolInput && typeof toolInput === "object") {
    return normalizeResult(toolInput as Partial<AnalysisResult>);
  }

  // Fallback: a model that answered with raw JSON text instead of a tool call.
  const text = blocks?.find((c) => "text" in c)?.text;
  if (!text) throw new Error("Bedrock returned no usable tool or text output.");
  return normalizeResult(extractJson(text) as Partial<AnalysisResult>);
}

function mockAnalysis(scenario: Scenario): AnalysisResult {
  const base: AnalysisResult = {
    egress_points: [
      { type: "Primary Door", coordinates: [0.32, 0.04, 0.86, 0.2], accessibility_status: "Clear" },
      { type: "Window", coordinates: [0.28, 0.74, 0.62, 0.95], accessibility_status: "Clear" },
    ],
    hazards: [{ description: "Glass shelving", reason: "Can shatter.", coordinates: [0.18, 0.4, 0.5, 0.58] }],
    safe_zones: [{ type: "Cover", description: "Sturdy desk", effectiveness_rating: "High", coordinates: [0.62, 0.42, 0.92, 0.7] }],
    actionable_instructions: [],
  };
  if (scenario === "FIRE") {
    base.actionable_instructions = ["Stay low.", "Head to primary door.", "Call 911 once outside."];
  } else if (scenario === "EARTHQUAKE") {
    base.safe_zones[0].type = "Drop & Cover";
    base.actionable_instructions = ["Drop, cover, hold on.", "Stay away from glass.", "Exit after shaking stops."];
  } else {
    base.actionable_instructions = ["Lock the door.", "Hide out of sight.", "Silence your phone."];
  }
  return base;
}

function mockVideoAnalysis(scenario: Scenario): AnalysisResult {
  const photo = mockAnalysis(scenario);
  return {
    ...photo,
    room_model: {
      walls: [[[0.08, 0.08], [0.92, 0.08]], [[0.92, 0.08], [0.92, 0.92]], [[0.92, 0.92], [0.08, 0.92]], [[0.08, 0.92], [0.08, 0.08]]],
      landmarks: [
        { label: "Main exit", type: "exit", position: [0.5, 0.08], detail: "Clear" },
        { label: "Desk", type: "safe_zone", position: [0.72, 0.62], detail: "Cover" },
        { label: "Glass shelf", type: "hazard", position: [0.28, 0.42] },
      ],
      scan_origin: [0.5, 0.78],
      exit_path: scenario === "EARTHQUAKE"
        ? [[0.5, 0.78], [0.72, 0.62]]
        : [[0.5, 0.78], [0.5, 0.4], [0.5, 0.12]],
    },
  };
}

export async function runSpatialAnalysis(
  input: AnalyzeInput,
  scenario: Scenario,
): Promise<{ result: AnalysisResult; model: string }> {
  if (!hasAwsCredentials()) {
    return {
      result: input.mode === "video360" ? mockVideoAnalysis(scenario) : mockAnalysis(scenario),
      model: "mock",
    };
  }

  const client = new BedrockRuntimeClient({ region: AWS_REGION });
  const candidates = [BEDROCK_MODEL_ID];
  if (BEDROCK_FALLBACK_MODEL_ID && BEDROCK_FALLBACK_MODEL_ID !== BEDROCK_MODEL_ID) {
    candidates.push(BEDROCK_FALLBACK_MODEL_ID);
  }

  let lastErr: unknown;
  for (const modelId of candidates) {
    try {
      return { result: await invokeModel(client, modelId, input, scenario), model: modelId };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All vision models failed.");
}
