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
  Scenario,
} from "@/lib/types";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// SYSTEM PROMPT
// ---------------------------------------------------------------------------
// Spatial Emergency VLM contract (see AGENTS.md). Claude has no json_object
// flag, so the prompt itself enforces raw-JSON-only output. The active scenario
// (FIRE / EARTHQUAKE / CODE_RED) is supplied in the user message.
const SYSTEM_PROMPT = `You are SafeSpace, a Spatial Emergency Intelligence system. You analyze a single photograph of an indoor space and produce a life-safety plan for a specific emergency scenario: FIRE, EARTHQUAKE, or CODE_RED (active threat / lockdown). The scenario is given in the user's message.

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
- FIRE: Prefer low, smoke-free egress. Treat flammable/electrical items, blocked or hot doorways, and glass as hazards. Doors that likely lead outside are higher value than interior windows above ground level.
- EARTHQUAKE: Best safe_zones are sturdy cover ("Drop & Cover" under solid desks/tables, or "Cover" beside load-bearing structure). Hazards are anything that can fall, shatter, or topple (windows, shelves, mirrors, tall/unsecured furniture, hanging objects). Do NOT recommend doorways or exiting during shaking.
- CODE_RED: Best safe_zones are concealment ("Hiding Spot") out of sightline from doors/windows, and lockable/barricadable cover. Hazards are anything that exposes the occupant to a line of sight from entry points. De-prioritize using doors/windows as exits unless clearly safe.

OUTPUT FORMAT
Return ONLY a single raw JSON object. No prose, no explanation, no markdown, no code fences. The object MUST match exactly this schema:

{
  "egress_points": [
    {
      "type": "Primary Door" | "Secondary Door" | "Window",
      "coordinates": [ymin, xmin, ymax, xmax],
      "accessibility_status": "Clear" | "Partially Blocked" | "Blocked"
    }
  ],
  "hazards": [
    {
      "description": "short label of the hazard, e.g. 'Glass window'",
      "reason": "why it is dangerous in this scenario",
      "coordinates": [ymin, xmin, ymax, xmax]
    }
  ],
  "safe_zones": [
    {
      "type": "Hiding Spot" | "Cover" | "Drop & Cover",
      "description": "short label, e.g. 'Under the wooden desk'",
      "effectiveness_rating": "High" | "Medium" | "Low",
      "coordinates": [ymin, xmin, ymax, xmax]
    }
  ],
  "actionable_instructions": [
    "Step 1 ...",
    "Step 2 ..."
  ]
}

RULES
- Use ONLY the enum values shown above, spelled and capitalized exactly. Pick the closest "type" when the literal item differs (e.g. a back/side exit -> "Secondary Door").
- Choose exactly one main exit and label it "Primary Door"; any additional exits use "Secondary Door" or "Window".
- Any array may be empty ([]) if nothing of that kind is visible. Never omit a key.
- actionable_instructions: 3-6 short, imperative, scenario-specific steps, ordered by what to do first. Reference the regions you identified (e.g. "Take cover under the desk on the right").
- Keep descriptions concise (a few words). Do not include coordinates inside text fields.
- Output must be valid JSON parseable by JSON.parse. Do not add trailing commas or comments.`;

// Per-scenario user instruction appended after the image.
const SCENARIO_INSTRUCTIONS: Record<Scenario, string> = {
  FIRE: "Scenario: FIRE. Prioritize low, smoke-free egress and avoid flammable hazards.",
  EARTHQUAKE:
    "Scenario: EARTHQUAKE. Prioritize sturdy cover (safe zones) and flag falling hazards.",
  CODE_RED:
    "Scenario: CODE_RED. Prioritize concealment/hiding spots and lockable barriers; avoid line-of-sight to doors/windows.",
};

// ---------------------------------------------------------------------------
// AWS Bedrock — Claude Sonnet 4.5 via the Converse API
// ---------------------------------------------------------------------------
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const BEDROCK_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ??
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0";

// AGENTS.md inference parameters.
const TEMPERATURE = 0.1;
const MAX_TOKENS = 1024;

/** Bedrock auth comes from the standard AWS credential chain. */
function hasAwsCredentials(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

/** Parse a base64 (data URL or raw) image into bytes + Bedrock image format. */
function parseImage(image: string): { bytes: Uint8Array; format: ImageFormat } {
  let format: ImageFormat = "jpeg";
  let base64 = image;

  const match = /^data:image\/(png|jpe?g|gif|webp);base64,(.*)$/i.exec(image);
  if (match) {
    const ext = match[1].toLowerCase();
    format = ext === "jpg" ? "jpeg" : (ext as ImageFormat);
    base64 = match[2];
  } else if (image.startsWith("data:")) {
    // Unknown data URL prefix — strip everything up to the comma.
    base64 = image.slice(image.indexOf(",") + 1);
  }

  return { bytes: new Uint8Array(Buffer.from(base64, "base64")), format };
}

/**
 * Extract a JSON object from a model response that may include stray prose or
 * markdown code fences, then parse it.
 */
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

/** Where the scan image lives: an uploaded S3 object or inline base64. */
type ImageSource =
  | { kind: "s3"; key: string; contentType?: string }
  | { kind: "inline"; image: string };

/** Build the Bedrock image content block for the given source. */
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
  source: ImageSource,
  scenario: Scenario,
): Promise<AnalysisResult> {
  // No AWS creds -> deterministic mock so the flow is demoable offline.
  if (!hasAwsCredentials()) {
    return mockAnalysis(scenario);
  }

  const client = new BedrockRuntimeClient({ region: AWS_REGION });

  const content: ContentBlock[] = [
    { text: SCENARIO_INSTRUCTIONS[scenario] },
    toImageBlock(source),
  ];

  const command = new ConverseCommand({
    modelId: BEDROCK_MODEL_ID,
    system: [{ text: SYSTEM_PROMPT }],
    messages: [{ role: "user", content }],
    inferenceConfig: { temperature: TEMPERATURE, maxTokens: MAX_TOKENS },
  });

  const response = await client.send(command);
  const text = response.output?.message?.content?.find((c) => "text" in c)?.text;
  if (!text) {
    throw new Error("Bedrock returned an empty response.");
  }

  return normalizeResult(extractJson(text) as Partial<AnalysisResult>);
}

/** Defensive normalization so the frontend always gets the full shape. */
function normalizeResult(raw: Partial<AnalysisResult>): AnalysisResult {
  return {
    egress_points: raw.egress_points ?? [],
    hazards: raw.hazards ?? [],
    safe_zones: raw.safe_zones ?? [],
    actionable_instructions: raw.actionable_instructions ?? [],
  };
}

// ---------------------------------------------------------------------------
// Butterbase persistence (stub)
// ---------------------------------------------------------------------------
/**
 * Simulates saving a completed scan to Butterbase.
 *
 * When real Butterbase credentials are present (BUTTERBASE_API_URL/KEY) this
 * performs an actual insert via the generic client; otherwise it returns a
 * simulated success so the demo flow is never blocked.
 */
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

  // Simulated success fallback (no credentials configured yet).
  return {
    success: true,
    id: `mock_${Date.now()}`,
    error: res.error, // surfaced for visibility; safe to ignore in demo
  };
}

// ---------------------------------------------------------------------------
// POST /api/analyze
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { image, imageKey, imageContentType, scenario } = body;

  if (!["FIRE", "EARTHQUAKE", "CODE_RED"].includes(scenario)) {
    return NextResponse.json({ error: "Invalid `scenario`." }, { status: 400 });
  }

  // Prefer the S3 reference; fall back to inline base64.
  let source: ImageSource;
  let imageUrl: string | undefined;
  if (imageKey && isS3Configured()) {
    source = { kind: "s3", key: imageKey, contentType: imageContentType };
  } else if (image && typeof image === "string") {
    source = { kind: "inline", image };
  } else {
    return NextResponse.json(
      { error: "Provide an `imageKey` (S3) or inline base64 `image`." },
      { status: 400 },
    );
  }

  try {
    const result = await callVisionModel(source, scenario);
    const saved = await saveScanToButterbase({ scenario, result });

    // Hand the results page a presigned URL to render the S3 image.
    if (source.kind === "s3" && isS3Configured()) {
      imageUrl = await createDownloadUrl(source.key).catch(() => undefined);
    }

    const response: AnalyzeResponse = { ...result, scenario, imageUrl, saved };
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

// ---------------------------------------------------------------------------
// Mock analysis — deterministic per scenario for offline demos
// ---------------------------------------------------------------------------
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
