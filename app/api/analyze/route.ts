import { NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ImageFormat,
} from "@aws-sdk/client-bedrock-runtime";
import { butterbase } from "@/lib/butterbase";
import {
  contentTypeToImageFormat,
  createDownloadUrl,
  isS3Configured,
  s3Location,
} from "@/lib/s3";
import type {
  AnalysisResult,
  AnalyzeRequest,
  AnalyzeResponse,
  RoomModel,
  ScanMode,
  Scenario,
} from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT_PHOTO = `You are SafeSpace, a Spatial Emergency Intelligence system. You analyze a single photograph of an indoor space and produce a life-safety plan for a specific emergency scenario: FIRE, EARTHQUAKE, or CODE_RED (active threat / lockdown). The scenario is given in the user's message.

YOUR JOB
Identify, from what is actually visible in the image:
1. egress_points  - ways to leave the room (doors and windows).
2. hazards        - objects/areas that are dangerous in THIS scenario.
3. safe_zones     - the best places to take cover, shelter, or hide for THIS scenario.
4. actionable_instructions - a short, ordered survival plan.

COORDINATE SYSTEM (critical)
Every region MUST include "coordinates" as a bounding box of four normalized numbers in the exact order [ymin, xmin, ymax, xmax]:
- Values are fractions of the image, each between 0.0 and 1.0.
- 0.0 = top/left edge, 1.0 = bottom/right edge.
- ymin < ymax and xmin < xmax. Tightly bound the object you are referring to.
- Only annotate things you can actually see in the image. Never invent objects or guess locations off-screen.

SCENARIO REASONING
- FIRE: Prefer low, smoke-free egress. Treat flammable/electrical items, blocked or hot doorways, and glass as hazards.
- EARTHQUAKE: Best safe_zones are sturdy cover. Hazards are anything that can fall, shatter, or topple. Do NOT recommend exiting during shaking.
- CODE_RED: Best safe_zones are concealment out of sightline from doors/windows. De-prioritize using doors/windows as exits unless clearly safe.

OUTPUT FORMAT
Return ONLY a single raw JSON object. No prose, no markdown, no code fences. Schema:

{
  "egress_points": [{ "type": "Primary Door"|"Secondary Door"|"Window", "coordinates": [ymin,xmin,ymax,xmax], "accessibility_status": "Clear"|"Partially Blocked"|"Blocked" }],
  "hazards": [{ "description": "...", "reason": "...", "coordinates": [ymin,xmin,ymax,xmax] }],
  "safe_zones": [{ "type": "Hiding Spot"|"Cover"|"Drop & Cover", "description": "...", "effectiveness_rating": "High"|"Medium"|"Low", "coordinates": [ymin,xmin,ymax,xmax] }],
  "actionable_instructions": ["Step 1 ...", "Step 2 ..."]
}

RULES
- Use ONLY the enum values shown, spelled exactly.
- Choose exactly one main exit as "Primary Door".
- 3-6 imperative actionable_instructions.
- Output must be valid JSON.`;

const SYSTEM_PROMPT_VIDEO360 = `You are SafeSpace, a Spatial Emergency Intelligence system. You receive several sequential frames from a slow 360° room scan (iPhone video). The frames progress clockwise around the room from where the person stood.

YOUR JOB
1. Mentally stitch the frames into a complete picture of the room.
2. Build a synthesized TOP-DOWN floor plan (room_model) with walls, labeled landmarks, and a safe exit path.
3. Also return per-frame-style egress_points, hazards, safe_zones on the FIRST frame (the scan start view) for overlay compatibility.
4. actionable_instructions - ordered survival steps referencing landmarks and the exit path.

COORDINATE SYSTEMS
A) Image bboxes (egress_points, hazards, safe_zones): [ymin, xmin, ymax, xmax] normalized 0-1 on the FIRST frame only.
B) Room model (top-down floor plan, bird's eye):
   - All x/y values normalized 0.0-1.0 where (0,0) is top-left of the floor plan, (1,1) is bottom-right.
   - walls: array of segments, each [[x1,y1],[x2,y2]].
   - landmarks: { label, type, position: [x,y], detail? }
     type must be one of: "exit", "door", "window", "hazard", "safe_zone", "furniture"
   - exit_path: array of [x,y] waypoints from scan_origin to the primary exit, routing around hazards/furniture when possible (at least 3 points).
   - scan_origin: [x,y] where the person stood when they started the pan (usually near center-bottom of the floor plan).

SCENARIO REASONING
- FIRE: exit_path to nearest clear, low egress; mark flammable hazards.
- EARTHQUAKE: exit_path optional/secondary; emphasize safe_zone landmarks; hazards are falling objects.
- CODE_RED: exit_path to concealment, NOT through open doors; mark sightline hazards.

OUTPUT FORMAT — raw JSON only, no markdown:

{
  "egress_points": [...],
  "hazards": [...],
  "safe_zones": [...],
  "actionable_instructions": [...],
  "room_model": {
    "walls": [[[x1,y1],[x2,y2]], ...],
    "landmarks": [{ "label": "Main door", "type": "exit", "position": [x,y], "detail": "Clear" }],
    "exit_path": [[x,y], ...],
    "scan_origin": [x,y]
  }
}

RULES
- room_model is REQUIRED for 360° scans. Include at least 4 wall segments and 3 landmarks.
- exit_path must have 3+ points with a dotted-route feel (not a straight line through furniture).
- Label important objects: doors, windows, desks, shelves, fire hazards, hiding spots.
- Never omit keys. Arrays may be empty only where noted above.`;

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

const TEMPERATURE = 0.1;
const MAX_TOKENS_PHOTO = 1024;
const MAX_TOKENS_VIDEO = 4096;

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

type ImageSource =
  | { kind: "s3"; key: string; contentType?: string }
  | { kind: "inline"; image: string };

type AnalyzeInput = {
  mode: ScanMode;
  sources: ImageSource[];
};

function toImageBlock(source: ImageSource): ContentBlock {
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

async function callVisionModel(
  input: AnalyzeInput,
  scenario: Scenario,
): Promise<AnalysisResult> {
  if (!hasAwsCredentials()) {
    return input.mode === "video360"
      ? mockVideoAnalysis(scenario)
      : mockAnalysis(scenario);
  }

  const client = new BedrockRuntimeClient({ region: AWS_REGION });
  const isVideo = input.mode === "video360";
  const isMulti = input.sources.length > 1;

  const intro = isVideo
    ? `${SCENARIO_INSTRUCTIONS[scenario]}\n\nThese ${input.sources.length} frames are sequential slices of a 360° room scan, ordered left-to-right around the room. Synthesize the full room and return the room_model floor plan.`
    : isMulti
      ? `${SCENARIO_INSTRUCTIONS[scenario]}\n\nThese ${input.sources.length} photos show the same room from different angles. Combine what you see across all of them; place bounding boxes on the first photo.`
      : SCENARIO_INSTRUCTIONS[scenario];

  const content: ContentBlock[] = [
    { text: intro },
    ...(isVideo || isMulti
      ? input.sources.flatMap((src, i) => [
          {
            text: isVideo
              ? `Frame ${i + 1} of ${input.sources.length}:`
              : `Photo ${i + 1} of ${input.sources.length}:`,
          },
          toImageBlock(src),
        ])
      : [toImageBlock(input.sources[0])]),
  ];

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    system: [{ text: isVideo ? SYSTEM_PROMPT_VIDEO360 : SYSTEM_PROMPT_PHOTO }],
    messages: [{ role: "user", content }],
    inferenceConfig: {
      temperature: TEMPERATURE,
      maxTokens: isVideo ? MAX_TOKENS_VIDEO : MAX_TOKENS_PHOTO,
    },
  });

  const response = await client.send(command);
  const text = response.output?.message?.content?.find((c) => "text" in c)?.text;
  if (!text) {
    throw new Error("Bedrock returned an empty response.");
  }

  return normalizeResult(extractJson(text) as Partial<AnalysisResult>);
}

function normalizeRoomModel(raw: Partial<RoomModel> | undefined): RoomModel | undefined {
  if (!raw) return undefined;
  return {
    walls: raw.walls ?? [],
    landmarks: raw.landmarks ?? [],
    exit_path: raw.exit_path ?? [],
    scan_origin: raw.scan_origin ?? [0.5, 0.82],
  };
}

function normalizeResult(raw: Partial<AnalysisResult>): AnalysisResult {
  return {
    egress_points: raw.egress_points ?? [],
    hazards: raw.hazards ?? [],
    safe_zones: raw.safe_zones ?? [],
    actionable_instructions: raw.actionable_instructions ?? [],
    room_model: normalizeRoomModel(raw.room_model),
  };
}

async function saveScanToButterbase(data: {
  scenario: Scenario;
  result: AnalysisResult;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const record = {
    scenario: data.scenario,
    result: data.result,
    created_at: new Date().toISOString(),
  };

  const res = await butterbase.insert(record);
  if (res.success) {
    return { success: true, id: res.id };
  }

  return {
    success: true,
    id: `mock_${Date.now()}`,
    error: res.error,
  };
}

export async function POST(req: Request) {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { image, imageKey, imageContentType, frames, frameKeys, scenario } =
    body;
  const scanMode =
    body.scanMode ??
    (frames?.length || frameKeys?.length ? "video360" : "photo");

  if (!["FIRE", "EARTHQUAKE", "CODE_RED"].includes(scenario)) {
    return NextResponse.json({ error: "Invalid `scenario`." }, { status: 400 });
  }

  let input: AnalyzeInput;
  let imageUrl: string | undefined;
  let panoramaUrl: string | undefined;

  function sourcesFromFrames(): ImageSource[] | null {
    if (frameKeys?.length && isS3Configured()) {
      return frameKeys.map((key) => ({
        kind: "s3" as const,
        key,
        contentType: "image/jpeg",
      }));
    }
    if (frames?.length) {
      return frames.map((f) => ({ kind: "inline" as const, image: f }));
    }
    return null;
  }

  if (scanMode === "video360") {
    const sources = sourcesFromFrames();
    if (!sources?.length) {
      return NextResponse.json(
        { error: "Provide `frames` or `frameKeys` for a 360° video scan." },
        { status: 400 },
      );
    }
    input = { mode: "video360", sources };
    if (frameKeys?.length && isS3Configured()) {
      imageUrl = await createDownloadUrl(frameKeys[0]).catch(() => undefined);
    }
  } else {
    const fromFrames = sourcesFromFrames();
    if (fromFrames?.length) {
      input = { mode: "photo", sources: fromFrames };
      if (frameKeys?.length && isS3Configured()) {
        imageUrl = await createDownloadUrl(frameKeys[0]).catch(() => undefined);
      }
    } else if (imageKey && isS3Configured()) {
      input = {
        mode: "photo",
        sources: [
          { kind: "s3", key: imageKey, contentType: imageContentType },
        ],
      };
    } else if (image && typeof image === "string") {
      input = { mode: "photo", sources: [{ kind: "inline", image }] };
    } else {
      return NextResponse.json(
        {
          error:
            "Provide `image`/`imageKey`, or `frames`/`frameKeys` for photos.",
        },
        { status: 400 },
      );
    }
  }

  try {
    const result = await callVisionModel(input, scenario);
    const saved = await saveScanToButterbase({ scenario, result });

    if (
      !imageUrl &&
      input.sources[0]?.kind === "s3" &&
      isS3Configured()
    ) {
      imageUrl = await createDownloadUrl(input.sources[0].key).catch(
        () => undefined,
      );
    }

    if (input.mode === "video360" && input.sources.length > 1) {
      panoramaUrl = undefined;
    }

    const response: AnalyzeResponse = {
      ...result,
      scenario,
      scanMode,
      imageUrl,
      panoramaUrl,
      saved,
    };
    return NextResponse.json(response);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Spatial analysis failed unexpectedly.",
      },
      { status: 502 },
    );
  }
}

function mockAnalysis(scenario: Scenario): AnalysisResult {
  const base: AnalysisResult = {
    egress_points: [
      {
        type: "Primary Door",
        coordinates: [0.32, 0.04, 0.86, 0.2],
        accessibility_status: "Clear",
      },
      {
        type: "Window",
        coordinates: [0.28, 0.74, 0.62, 0.95],
        accessibility_status: "Clear",
      },
    ],
    hazards: [
      {
        description: "Glass shelving",
        reason: "Can shatter into sharp debris and block movement.",
        coordinates: [0.18, 0.4, 0.5, 0.58],
      },
    ],
    safe_zones: [
      {
        type: "Cover",
        description: "Sturdy desk in the corner",
        effectiveness_rating: "High",
        coordinates: [0.62, 0.42, 0.92, 0.7],
      },
    ],
    actionable_instructions: [],
  };

  switch (scenario) {
    case "FIRE":
      base.hazards.push({
        description: "Power strip / cables",
        reason: "Electrical ignition source near the floor exit path.",
        coordinates: [0.78, 0.06, 0.95, 0.26],
      });
      base.egress_points[1].accessibility_status = "Partially Blocked";
      base.actionable_instructions = [
        "Stay low — crawl beneath the smoke line toward the primary door.",
        "Feel the door with the back of your hand before opening it.",
        "Avoid the window exit on the right; smoke is banking on that wall.",
        "Once out, move 50 ft from the building and call emergency services.",
      ];
      break;
    case "EARTHQUAKE":
      base.safe_zones[0].type = "Drop & Cover";
      base.actionable_instructions = [
        "DROP, COVER, and HOLD ON under the sturdy desk (green zone).",
        "Stay clear of the glass shelving — it can shatter and fall.",
        "Do not run for the door while shaking continues.",
        "After shaking stops, exit calmly through the primary door.",
      ];
      break;
    case "CODE_RED":
      base.safe_zones.push({
        type: "Hiding Spot",
        description: "Corner out of the door's sightline",
        effectiveness_rating: "Medium",
        coordinates: [0.55, 0.04, 0.95, 0.22],
      });
      base.egress_points[0].accessibility_status = "Blocked";
      base.actionable_instructions = [
        "Lock and barricade the primary door immediately.",
        "Move to the corner out of the door's sightline and stay low.",
        "Silence your phone and turn off the lights.",
        "Remain quiet and out of view of the window until all-clear.",
      ];
      break;
  }

  return base;
}

function mockVideoAnalysis(scenario: Scenario): AnalysisResult {
  const photo = mockAnalysis(scenario);
  const room_model: RoomModel = {
    walls: [
      [[0.08, 0.08], [0.92, 0.08]],
      [[0.92, 0.08], [0.92, 0.92]],
      [[0.92, 0.92], [0.08, 0.92]],
      [[0.08, 0.92], [0.08, 0.08]],
      [[0.08, 0.35], [0.38, 0.35]],
    ],
    landmarks: [
      { label: "Main exit", type: "exit", position: [0.5, 0.08], detail: "Clear" },
      { label: "Desk", type: "furniture", position: [0.72, 0.55] },
      { label: "Glass shelf", type: "hazard", position: [0.28, 0.42], detail: "Shatter risk" },
      { label: "Window", type: "window", position: [0.88, 0.5] },
      {
        label: "Cover zone",
        type: "safe_zone",
        position: [0.72, 0.62],
        detail: "High cover",
      },
    ],
    scan_origin: [0.5, 0.78],
    exit_path:
      scenario === "CODE_RED"
        ? [
            [0.5, 0.78],
            [0.62, 0.68],
            [0.72, 0.62],
          ]
        : [
            [0.5, 0.78],
            [0.5, 0.55],
            [0.5, 0.28],
            [0.5, 0.12],
          ],
  };

  if (scenario === "EARTHQUAKE") {
    room_model.exit_path = [
      [0.5, 0.78],
      [0.58, 0.7],
      [0.72, 0.62],
    ];
  }

  return { ...photo, room_model };
}
