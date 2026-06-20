import type { AnalysisResult, SavedRoom } from "./types";

export function countPlanLabels(plan: AnalysisResult): {
  exits: number;
  safeZones: number;
  hazards: number;
} {
  return {
    exits: plan.egress_points?.length ?? 0,
    safeZones: plan.safe_zones?.length ?? 0,
    hazards: plan.hazards?.length ?? 0,
  };
}

export function countRoomLabels(room: SavedRoom): {
  exits: number;
  safeZones: number;
  hazards: number;
} {
  const plans = Object.values(room.plans ?? {});
  let exits = 0;
  let safeZones = 0;
  let hazards = 0;
  const seenExits = new Set<string>();
  const seenSafe = new Set<string>();

  for (const plan of plans) {
    for (const e of plan.egress_points ?? []) {
      const key = e.type + e.coordinates.join(",");
      if (!seenExits.has(key)) {
        seenExits.add(key);
        exits++;
      }
    }
    for (const s of plan.safe_zones ?? []) {
      const key = s.type + s.coordinates.join(",");
      if (!seenSafe.has(key)) {
        seenSafe.add(key);
        safeZones++;
      }
    }
    hazards = Math.max(hazards, plan.hazards?.length ?? 0);
  }

  return { exits, safeZones, hazards };
}

export function isPlanEmpty(plan: AnalysisResult | null | undefined): boolean {
  if (!plan) return true;
  return (
    (plan.egress_points?.length ?? 0) === 0 &&
    (plan.safe_zones?.length ?? 0) === 0 &&
    (plan.hazards?.length ?? 0) === 0 &&
    (plan.actionable_instructions?.length ?? 0) === 0 &&
    !plan.room_model
  );
}
