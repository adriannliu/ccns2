import { normalizeBBox } from "./bbox";
import type {
  AnalysisResult,
  EgressPoint,
  SafeZone,
  SavedRoom,
  Scenario,
} from "./types";

const SCENARIOS: Scenario[] = ["FIRE", "EARTHQUAKE", "CODE_RED"];

const EMPTY_PLAN: AnalysisResult = {
  egress_points: [],
  hazards: [],
  safe_zones: [],
  actionable_instructions: [],
};

function normalizeEgress(raw: unknown): EgressPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<EgressPoint>;
  const coordinates = normalizeBBox(item.coordinates);
  if (!coordinates) return null;
  return {
    type: item.type ?? "Primary Door",
    coordinates,
    accessibility_status: item.accessibility_status ?? "Clear",
  };
}

function normalizeSafeZone(raw: unknown): SafeZone | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<SafeZone>;
  const coordinates = normalizeBBox(item.coordinates);
  if (!coordinates) return null;
  return {
    type: item.type ?? "Cover",
    description: item.description ?? item.type ?? "Shelter",
    effectiveness_rating: item.effectiveness_rating ?? "Medium",
    coordinates,
  };
}

function normalizePlan(raw: unknown): AnalysisResult {
  if (!raw || typeof raw !== "object") return { ...EMPTY_PLAN };
  const plan = raw as Partial<AnalysisResult>;
  return {
    egress_points: (Array.isArray(plan.egress_points) ? plan.egress_points : [])
      .map(normalizeEgress)
      .filter((item): item is EgressPoint => item !== null),
    hazards: Array.isArray(plan.hazards) ? plan.hazards : [],
    safe_zones: (Array.isArray(plan.safe_zones) ? plan.safe_zones : [])
      .map(normalizeSafeZone)
      .filter((item): item is SafeZone => item !== null),
    actionable_instructions: Array.isArray(plan.actionable_instructions)
      ? plan.actionable_instructions
      : [],
    room_model: plan.room_model,
  };
}

function parsePlansRaw(raw: Partial<SavedRoom> | Record<string, unknown>): unknown {
  const record = raw as Record<string, unknown>;
  if (record.plans_json && typeof record.plans_json === "object") {
    return record.plans_json;
  }
  if (typeof record.plans_json === "string") {
    try {
      return JSON.parse(record.plans_json);
    } catch {
      return null;
    }
  }
  if (typeof record.plans === "string") {
    try {
      return JSON.parse(record.plans);
    } catch {
      return null;
    }
  }
  return record.plans;
}

function planScore(plan: AnalysisResult): number {
  return (
    plan.egress_points.length +
    plan.safe_zones.length +
    (plan.room_model ? 20 : 0)
  );
}

function mergePlan(a: AnalysisResult, b: AnalysisResult): AnalysisResult {
  return planScore(a) >= planScore(b) ? a : b;
}

function roomScore(room: SavedRoom): number {
  return Object.values(room.plans).reduce((total, plan) => total + planScore(plan), 0);
}

/** Merge two copies of the same room, keeping the richest plan data. */
export function mergeSavedRooms(a: SavedRoom, b: SavedRoom): SavedRoom {
  const left = normalizeSavedRoom(a);
  const right = normalizeSavedRoom(b);
  const primary = roomScore(left) >= roomScore(right) ? left : right;
  const secondary = primary === left ? right : left;

  return {
    ...primary,
    label: primary.label || secondary.label,
    image: primary.image || secondary.image,
    panorama: primary.panorama || secondary.panorama,
    plans: {
      FIRE: mergePlan(primary.plans.FIRE, secondary.plans.FIRE),
      EARTHQUAKE: mergePlan(primary.plans.EARTHQUAKE, secondary.plans.EARTHQUAKE),
      CODE_RED: mergePlan(primary.plans.CODE_RED, secondary.plans.CODE_RED),
    },
  };
}

/** Coerce API / localStorage payloads into a complete SavedRoom. */
export function normalizeSavedRoom(
  raw: Partial<SavedRoom> | Record<string, unknown>,
): SavedRoom {
  const plans: SavedRoom["plans"] = {
    FIRE: { ...EMPTY_PLAN },
    EARTHQUAKE: { ...EMPTY_PLAN },
    CODE_RED: { ...EMPTY_PLAN },
  };

  const plansRaw = parsePlansRaw(raw);
  if (plansRaw && typeof plansRaw === "object") {
    for (const scenario of SCENARIOS) {
      const plan = (plansRaw as Record<string, unknown>)[scenario];
      if (plan) plans[scenario] = normalizePlan(plan);
    }
  }

  return {
    id: String(raw.id ?? ""),
    label: String(raw.label ?? "Unnamed room"),
    image: String(raw.image ?? ""),
    panorama: raw.panorama ? String(raw.panorama) : undefined,
    scanMode: raw.scanMode === "photo" ? "photo" : "video360",
    plans,
    createdAt: Number(raw.createdAt ?? Date.now()),
  };
}
