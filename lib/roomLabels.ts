import { overlayLabelCount } from "./planCounts";
import type { AnalysisResult, SavedRoom } from "./types";

export function planLabelCount(plan: AnalysisResult): number {
  return overlayLabelCount(plan);
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
