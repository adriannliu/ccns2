import type { AnalysisResult, SavedRoom } from "./types";

export function planLabelCount(plan: AnalysisResult): number {
  return (
    (plan.egress_points?.length ?? 0) +
    (plan.safe_zones?.length ?? 0) +
    (plan.room_model ? 1 : 0)
  );
}

export function roomLabelCount(room: SavedRoom): number {
  return Object.values(room.plans).reduce(
    (total, plan) => total + planLabelCount(plan),
    0,
  );
}
