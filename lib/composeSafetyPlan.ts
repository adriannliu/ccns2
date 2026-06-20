import type { SafetyPlanSelection } from "@/lib/bedrockTool";
import type { SpatialDetection } from "@/lib/detection/types";
import type {
  AnalysisResult,
  EgressType,
  Hazard,
  SafeZone,
} from "@/lib/types";

function detectionMap(
  detections: SpatialDetection[],
): Map<string, SpatialDetection> {
  return new Map(detections.map((d) => [d.id, d]));
}

function egressTypeForDetection(
  det: SpatialDetection,
  chosen: EgressType,
): EgressType | null {
  if (det.category === "egress_window") return "Window";
  if (det.category === "egress_door") {
    if (chosen === "Window") return null;
    return chosen === "Secondary Door" ? "Secondary Door" : "Primary Door";
  }
  return null;
}

function safeZoneAllowed(det: SpatialDetection): boolean {
  return det.category === "furniture";
}

/**
 * Map VLM selections (detection ids only) onto detector bounding boxes.
 */
export function composeSafetyPlan(
  detections: SpatialDetection[],
  raw: SafetyPlanSelection,
): Partial<AnalysisResult> {
  const byId = detectionMap(detections);
  const egress_points = (raw.egress_selections ?? [])
    .map((sel) => {
      const det = byId.get(sel.detection_id);
      if (!det) return null;
      const type = egressTypeForDetection(det, sel.type);
      if (!type) return null;
      return {
        type,
        coordinates: det.coordinates,
        accessibility_status: sel.accessibility_status,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const safe_zones = (raw.safe_zone_selections ?? [])
    .map((sel) => {
      const det = byId.get(sel.detection_id);
      if (!det || !safeZoneAllowed(det)) return null;
      return {
        type: sel.type,
        description: sel.description || det.label,
        effectiveness_rating: sel.effectiveness_rating,
        coordinates: det.coordinates,
      } satisfies SafeZone;
    })
    .filter((x): x is SafeZone => x !== null);

  const hazards = (raw.hazard_selections ?? [])
    .map((sel) => {
      const det = byId.get(sel.detection_id);
      if (!det) return null;
      return {
        description: sel.description?.trim() || det.label,
        reason: sel.reason,
        coordinates: det.coordinates,
      } satisfies Hazard;
    })
    .filter((x): x is Hazard => x !== null);

  return {
    egress_points,
    safe_zones,
    hazards,
    actionable_instructions: raw.actionable_instructions ?? [],
    room_model: raw.room_model,
  };
}

/** Offline mock: pick obvious detections per scenario without calling Bedrock. */
export function composeMockSafetyPlan(
  detections: SpatialDetection[],
  scenario: import("@/lib/types").Scenario,
): Partial<AnalysisResult> {
  const door = detections.find((d) => d.category === "egress_door");
  const window = detections.find((d) => d.category === "egress_window");
  const desk = detections.find((d) => d.label.toLowerCase().includes("desk"));
  const shelf = detections.find((d) => d.label.toLowerCase().includes("shelf"));

  const egress_selections = [
    door && {
      detection_id: door.id,
      type: "Primary Door" as const,
      accessibility_status: "Clear" as const,
    },
    window && {
      detection_id: window.id,
      type: "Window" as const,
      accessibility_status: "Clear" as const,
    },
  ].filter(Boolean) as SafetyPlanSelection["egress_selections"];

  const hazard_selections = shelf
    ? [{ detection_id: shelf.id, reason: "Can shatter or fall.", description: "Glass shelving" }]
    : [];

  const safe_zone_selections =
    scenario === "EARTHQUAKE" && desk
      ? [
          {
            detection_id: desk.id,
            type: "Drop & Cover" as const,
            effectiveness_rating: "High" as const,
            description: "Sturdy desk",
          },
        ]
      : scenario !== "EARTHQUAKE" && desk
        ? [
            {
              detection_id: desk.id,
              type: "Cover" as const,
              effectiveness_rating: "High" as const,
              description: "Sturdy desk",
            },
          ]
        : [];

  const instructions: Record<import("@/lib/types").Scenario, string[]> = {
    FIRE: ["Stay low.", "Head to primary door.", "Call 911 once outside."],
    EARTHQUAKE: ["Drop, cover, hold on.", "Stay away from glass.", "Exit after shaking stops."],
    CODE_RED: ["Lock the door.", "Hide out of sight.", "Silence your phone."],
  };

  return composeSafetyPlan(detections, {
    egress_selections,
    safe_zone_selections,
    hazard_selections,
    actionable_instructions: instructions[scenario],
  });
}
