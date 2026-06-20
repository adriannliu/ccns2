import { NextResponse } from "next/server";
import { butterbase } from "@/lib/butterbase";
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
// TODO: Replace this placeholder with the exact system prompt text.
// It should instruct the Vision-Language Model to return ONLY JSON matching
// the AnalysisResult schema, using normalized [ymin, xmin, ymax, xmax] boxes.
const SYSTEM_PROMPT = `__SYSTEM_PROMPT_PLACEHOLDER__`;

// Per-scenario user instruction appended after the image.
const SCENARIO_INSTRUCTIONS: Record<Scenario, string> = {
  FIRE: "Scenario: FIRE. Prioritize low, smoke-free egress and avoid flammable hazards.",
  EARTHQUAKE:
    "Scenario: EARTHQUAKE. Prioritize sturdy cover (safe zones) and flag falling hazards.",
  CODE_RED:
    "Scenario: CODE_RED. Prioritize concealment/hiding spots and lockable barriers; avoid line-of-sight to doors/windows.",
};

// ---------------------------------------------------------------------------
// Vision AI call (OpenAI-compatible / Gemini-style placeholder)
// ---------------------------------------------------------------------------
const VISION_API_URL = process.env.VISION_API_URL ?? "";
const VISION_API_KEY = process.env.VISION_API_KEY ?? "";
const VISION_MODEL = process.env.VISION_MODEL ?? "gpt-4o";

/** Ensure a data URL string for the model; strips nothing if already a URL. */
function asDataUrl(image: string): string {
  return image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;
}

async function callVisionModel(
  image: string,
  scenario: Scenario,
): Promise<AnalysisResult> {
  // If no key is configured, fall back to a deterministic mock so the app is
  // fully demoable at a hackathon without external credentials.
  if (!VISION_API_KEY || !VISION_API_URL) {
    return mockAnalysis(scenario);
  }

  const res = await fetch(VISION_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VISION_API_KEY}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      // OpenAI-compatible multimodal message format.
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: SCENARIO_INSTRUCTIONS[scenario] },
            {
              type: "image_url",
              image_url: { url: asDataUrl(image) },
            },
          ],
        },
      ],
      // Force structured JSON output where supported.
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Vision API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const payload = await res.json();
  // OpenAI-compatible shape: choices[0].message.content is a JSON string.
  const content: string | undefined = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Vision API returned an empty response.");
  }

  return normalizeResult(JSON.parse(content));
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

  const { image, scenario } = body;

  if (!image || typeof image !== "string") {
    return NextResponse.json(
      { error: "Missing base64 `image`." },
      { status: 400 },
    );
  }
  if (!["FIRE", "EARTHQUAKE", "CODE_RED"].includes(scenario)) {
    return NextResponse.json(
      { error: "Invalid `scenario`." },
      { status: 400 },
    );
  }

  try {
    const result = await callVisionModel(image, scenario);
    const saved = await saveScanToButterbase({ scenario, result });

    const response: AnalyzeResponse = { ...result, scenario, saved };
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
      { type: "Main Door", coordinates: [0.32, 0.04, 0.86, 0.2], status: "clear" },
      { type: "Window", coordinates: [0.28, 0.74, 0.62, 0.95], status: "clear" },
    ],
    hazards: [
      { type: "Glass shelving", coordinates: [0.18, 0.4, 0.5, 0.58] },
    ],
    safe_zones: [
      { type: "Under sturdy desk", coordinates: [0.62, 0.42, 0.92, 0.7] },
    ],
    actionable_instructions: [],
  };

  switch (scenario) {
    case "FIRE":
      base.hazards.push({
        type: "Power strip / cables",
        coordinates: [0.78, 0.06, 0.95, 0.26],
      });
      base.egress_points[1].status = "compromised";
      base.actionable_instructions = [
        "Stay low — crawl beneath the smoke line toward the main door.",
        "Feel the door with the back of your hand before opening it.",
        "Avoid the window exit on the right; smoke is banking on that wall.",
        "Once out, move 50 ft from the building and call emergency services.",
      ];
      break;
    case "EARTHQUAKE":
      base.actionable_instructions = [
        "DROP, COVER, and HOLD ON under the sturdy desk (green zone).",
        "Stay clear of the glass shelving — it can shatter and fall.",
        "Do not run for the door while shaking continues.",
        "After shaking stops, exit calmly through the main door.",
      ];
      break;
    case "CODE_RED":
      base.safe_zones.push({
        type: "Corner out of sightline",
        coordinates: [0.55, 0.04, 0.95, 0.22],
      });
      base.egress_points[0].status = "blocked";
      base.actionable_instructions = [
        "Lock and barricade the main door immediately.",
        "Move to the corner out of the door's sightline and stay low.",
        "Silence your phone and turn off the lights.",
        "Remain quiet and out of view of the window until all-clear.",
      ];
      break;
  }

  return base;
}
