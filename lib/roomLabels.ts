import type { AnalysisResult, SavedRoom } from "./types";

export function planLabelCount(plan: AnalysisResult): number {
  return (
    (plan.egress_points?.length ?? 0) +
    (plan.safe_zones?.length ?? 0) +
    (plan.room_model ? 1 : 0)
  );
}

export function roomLabelCount(room: SavedRoom): number {
  let total = Object.values(room.plans).reduce(
    (sum, plan) => sum + planLabelCount(plan),
    0,
  );
  for (const framePlan of room.framePlans ?? []) {
    total += Object.values(framePlan).reduce(
      (sum, plan) => sum + planLabelCount(plan),
      0,
    );
  }
  return total;
}
