import type { DetectionCategory } from "./types";

/** Map Rekognition / YOLO class names to our semantic categories. */
export function categorizeLabel(label: string): DetectionCategory {
  const n = label.toLowerCase().replace(/_/g, " ").trim();

  if (/\b(door|doorway|entry)\b/.test(n) && !/\b(cabinet|garage door opener)\b/.test(n)) {
    return "egress_door";
  }
  if (/\b(window|skylight)\b/.test(n)) return "egress_window";

  if (
    /\b(desk|table|counter|workbench|credenza|island|furniture|cabinet|filing|bookshelf|bookcase|shelf|sofa|couch|bed|dresser|wardrobe|closet)\b/.test(
      n,
    )
  ) {
    return "furniture";
  }
  if (/\b(chair|stool|bench)\b/.test(n)) return "furniture";

  if (
    /\b(laptop|notebook|computer|keyboard|mouse|tablet|cell phone|mobile phone|phone|backpack|book|printer)\b/.test(
      n,
    )
  ) {
    return "furniture";
  }

  if (/\b(plant|potted plant|flower|vase)\b/.test(n)) return "structure";

  if (/\b(cup|mug|bottle|glass|bowl)\b/.test(n)) return "fixture";

  if (
    /\b(pillar|column|post|pole|beam|joist|rafter|truss|duct|pipe|conduit|hvac|air.?con|vent|structural|I-beam|girder)\b/.test(
      n,
    )
  ) {
    return "structure";
  }

  if (
    /\b(light|lamp|fixture|sprinkler|smoke|detector|thermostat|outlet|switch|monitor|television|tv|whiteboard|mirror)\b/.test(
      n,
    )
  ) {
    return "fixture";
  }

  return "other";
}

export function categoryHint(category: DetectionCategory): string {
  switch (category) {
    case "egress_door":
      return "candidate exit (door)";
    case "egress_window":
      return "candidate exit (window)";
    case "furniture":
      return "floor furniture (cover/hide candidate)";
    case "structure":
      return "structural/HVAC (hazard candidate, never safe zone)";
    case "fixture":
      return "fixture/appliance (hazard candidate)";
    default:
      return "other";
  }
}
