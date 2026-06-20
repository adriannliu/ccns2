import { NextResponse } from "next/server";
import { butterbase } from "@/lib/butterbase";
import { buildAnalyzeInput, resolveDisplayImageUrl } from "@/lib/analyzeInput";
import { runSpatialAnalysis } from "@/lib/spatialAnalysis";
import type {
  AnalysisResult,
  AnalyzeRequest,
  AnalyzeResponse,
  Scenario,
} from "@/lib/types";

export const runtime = "nodejs";

/**
 * POST /api/analyze — single-scenario spatial analysis.
 *
 * Thin wrapper around the shared analysis pipeline:
 *   buildAnalyzeInput()  -> normalize the capture payload (photo / multi / video)
 *   runSpatialAnalysis() -> Bedrock Converse with forced tool-use (Claude → Nova fallback)
 *
 * The room-library setup route (/api/rooms/setup) uses the same helpers, so
 * model wiring and output normalization live in exactly one place.
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
  if (res.success) return { success: true, id: res.id };
  return { success: true, id: `mock_${Date.now()}`, error: res.error };
}

export async function POST(req: Request) {
  let body: AnalyzeRequest;
  try {
    body = (await req.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { scenario } = body;
  if (!["FIRE", "EARTHQUAKE", "CODE_RED"].includes(scenario)) {
    return NextResponse.json({ error: "Invalid `scenario`." }, { status: 400 });
  }

  let built;
  try {
    built = buildAnalyzeInput(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid capture payload." },
      { status: 400 },
    );
  }

  const scanMode = body.scanMode ?? built.input.mode;

  try {
    const { result, model } = await runSpatialAnalysis(built.input, scenario);
    const saved = await saveScanToButterbase({ scenario, result });
    const imageUrl = await resolveDisplayImageUrl(built.input, built.imageUrl);

    const response: AnalyzeResponse = {
      ...result,
      scenario,
      scanMode,
      imageUrl,
      saved,
      model,
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
