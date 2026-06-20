import type { ImageSource, AnalyzeInput } from "./analyzeInput";
import type { Scenario, ScenarioPlans } from "./types";
import { ALL_SCENARIOS, runSpatialAnalysis } from "./spatialAnalysis";

async function analyzeScenarios(input: AnalyzeInput): Promise<ScenarioPlans> {
  const results = await Promise.all(
    ALL_SCENARIOS.map(async (scenario) => {
      const { result } = await runSpatialAnalysis(input, scenario);
      return [scenario, result] as const;
    }),
  );
  return Object.fromEntries(results) as ScenarioPlans;
}

function stripRoomModel(plans: ScenarioPlans): ScenarioPlans {
  const out = {} as ScenarioPlans;
  for (const scenario of ALL_SCENARIOS as Scenario[]) {
    const { room_model: _rm, ...rest } = plans[scenario];
    out[scenario] = rest;
  }
  return out;
}

/**
 * Label every photo in a multi-photo room setup and use the first view as the
 * primary emergency plan (matches the thumbnail / room.image).
 */
export async function setupMultiPhotoRoom(
  frameSources: ImageSource[],
): Promise<{ plans: ScenarioPlans; framePlans: ScenarioPlans[] }> {
  const framePlans: ScenarioPlans[] = [];
  for (const source of frameSources) {
    framePlans.push(
      await analyzeScenarios({ mode: "photo", sources: [source] }),
    );
  }

  return {
    plans: framePlans[0],
    framePlans,
  };
}

/**
 * Run a full 360° room setup: one video360 pass for the floor plan, then a
 * photo-style analysis on every sampled frame for per-view labels.
 */
export async function setupVideo360Room(
  videoInput: AnalyzeInput,
  frameSources: ImageSource[],
): Promise<{ plans: ScenarioPlans; framePlans: ScenarioPlans[] }> {
  const plans = await analyzeScenarios(videoInput);

  const framePlans: ScenarioPlans[] = [];
  for (const source of frameSources) {
    const labeled = stripRoomModel(
      await analyzeScenarios({ mode: "photo", sources: [source] }),
    );
    framePlans.push(labeled);
  }

  return { plans, framePlans };
}
