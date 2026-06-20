import { bboxCenter, normalizeBBox } from "@/lib/bbox";
import type {
  AccessibilityStatus,
  AnalysisResult,
  EgressPoint,
  EgressType,
  Scenario,
} from "@/lib/types";

/** Assumed camera/user position when holding the phone facing into the room. */
export const USER_POSITION = { x: 0.5, y: 0.92 } as const;

const ACCESSIBILITY_RANK: Record<AccessibilityStatus, number> = {
  Clear: 0,
  "Partially Blocked": 1,
  Blocked: 2,
};

const EGRESS_TYPE_RANK: Record<EgressType, number> = {
  "Primary Door": 0,
  "Secondary Door": 1,
  Window: 2,
};

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Pick the best egress: prefer clear primary doors, then nearest by distance. */
export function pickRecommendedEgress(
  egress: EgressPoint[],
): EgressPoint | null {
  const valid = egress.filter((e) => normalizeBBox(e.coordinates) !== null);
  if (valid.length === 0) return null;

  const reachable = valid.filter((e) => e.accessibility_status !== "Blocked");
  const candidates = reachable.length > 0 ? reachable : valid;

  return [...candidates].sort((a, b) => {
    const byAccess =
      ACCESSIBILITY_RANK[a.accessibility_status] -
      ACCESSIBILITY_RANK[b.accessibility_status];
    if (byAccess !== 0) return byAccess;

    const byType = EGRESS_TYPE_RANK[a.type] - EGRESS_TYPE_RANK[b.type];
    if (byType !== 0) return byType;

    return (
      dist(USER_POSITION, bboxCenter(a.coordinates)) -
      dist(USER_POSITION, bboxCenter(b.coordinates))
    );
  })[0];
}

export function hasViableExit(
  result: AnalysisResult,
  scenario?: Scenario,
): boolean {
  const showExitPath = !scenario || scenario !== "EARTHQUAKE";
  if (!showExitPath) return false;
  return pickRecommendedEgress(result.egress_points ?? []) !== null;
}

export function imageOverlayCaption(
  result: AnalysisResult,
  scenario?: Scenario,
): string {
  if (scenario === "EARTHQUAKE") {
    return "Marked cover zones and hazards — no exit path during shaking.";
  }
  if (hasViableExit(result, scenario)) {
    return "Exits, windows, and shelter spots — dotted line to nearest exit.";
  }
  return "Exits, windows, and shelter spots — no viable exit detected in this view.";
}

export function roomModelCaption(
  scenario: Scenario | undefined,
  hasExitPath: boolean,
): string {
  if (scenario === "EARTHQUAKE") {
    return "Head to marked cover zones — do not use exit paths while shaking.";
  }
  if (!hasExitPath) {
    return scenario === "CODE_RED"
      ? "No exit path found — move to marked concealment spots."
      : scenario === "FIRE"
        ? "No exit path found — use marked exits and shelter spots."
        : "No exit path found — use marked exits and shelter spots.";
  }
  if (scenario === "FIRE") {
    return "Follow the dotted line to the nearest exit.";
  }
  if (scenario === "CODE_RED") {
    return "Move to concealment along the dotted path.";
  }
  return "Stitched from your 360° scan — follow the dotted line to the exit.";
}
