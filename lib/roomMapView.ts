import type { AnalysisResult, BBox, SavedRoom, Scenario, ScenarioPlans } from "./types";

const ROOM_MODEL_PRIORITY: Scenario[] = ["FIRE", "CODE_RED", "EARTHQUAKE"];

function bboxKey(coordinates: BBox): string {
  return coordinates.map((n) => Number(n).toFixed(2)).join(",");
}

function mergeByBBox<T extends { coordinates: BBox }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    if (!Array.isArray(item?.coordinates) || item.coordinates.length < 4) continue;
    seen.set(bboxKey(item.coordinates as BBox), item);
  }
  return [...seen.values()];
}

/** Neutral annotated map from scenario plans (no scenario steps). */
export function buildPlansMapView(plans: ScenarioPlans): AnalysisResult {
  const list = Object.values(plans ?? {}).filter(
    (plan): plan is AnalysisResult => Boolean(plan),
  );

  const egress_points = mergeByBBox(
    list.flatMap((plan) =>
      Array.isArray(plan.egress_points) ? plan.egress_points : [],
    ),
  );
  const safe_zones = mergeByBBox(
    list.flatMap((plan) =>
      Array.isArray(plan.safe_zones) ? plan.safe_zones : [],
    ),
  );

  return {
    egress_points,
    safe_zones,
    hazards: [],
    actionable_instructions: [],
  };
}

/** Neutral annotated map for the saved-rooms library (no scenario steps). */
export function buildRoomMapView(room: SavedRoom): AnalysisResult {
  const plans = Object.values(room.plans ?? {}).filter(
    (plan): plan is AnalysisResult => Boolean(plan),
  );

  const merged = buildPlansMapView(room.plans);

  const room_model =
    ROOM_MODEL_PRIORITY.map(
      (scenario) => room.plans?.[scenario]?.room_model,
    ).find(Boolean) ?? plans.find((plan) => plan.room_model)?.room_model;

  return {
    ...merged,
    room_model,
  };
}
