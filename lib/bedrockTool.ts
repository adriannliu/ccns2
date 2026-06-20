/**
 * Bedrock Converse "tool use" definition for SafeSpace.
 *
 * Instead of asking the model to emit raw JSON (which Amazon Nova in particular
 * is unreliable at — it tends to return prose strings and string lists), we
 * force the model to call a single tool whose `inputSchema` IS our output
 * schema. With `toolChoice: { tool }` the model must return arguments matching
 * the schema, which both Anthropic Claude 3+ and Amazon Nova support.
 *
 * See: https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ToolChoice.html
 */

import type {
  ContentBlock,
  ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";

export const SAFETY_PLAN_TOOL_NAME = "emit_safety_plan";

const BBOX = {
  type: "array",
  description:
    "Tight bounding box [ymin, xmin, ymax, xmax] around the physical object (door, glass pane, desk top, shelf) — not open floor or empty space beneath furniture. Each value 0.0 (top/left) to 1.0 (bottom/right). ymin < ymax and xmin < xmax.",
  items: { type: "number" },
  minItems: 4,
  maxItems: 4,
} as const;

const POINT2D = {
  type: "array",
  description: "[x, y] on the top-down floor plan, each 0.0-1.0 (0,0 = top-left).",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
} as const;

/** JSON schema mirroring lib/types.ts `AnalysisResult`. */
const SAFETY_PLAN_SCHEMA = {
  type: "object",
  properties: {
    egress_points: {
      type: "array",
      description:
        "Visible doors and windows only. Windows require clear evidence (glass + frame/sill/daylight) — not mirrors or screens. Omit uncertain openings. Doors-only is OK.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["Primary Door", "Secondary Door", "Window"],
            description:
              "Window only when glass pane + frame/sill/blinds or outdoor view is visible. One Primary Door.",
          },
          coordinates: BBOX,
          accessibility_status: {
            type: "string",
            enum: ["Clear", "Partially Blocked", "Blocked"],
            description:
              "Clear = unobstructed; Partially Blocked = clutter near opening; Blocked = not passable.",
          },
        },
        required: ["type", "coordinates", "accessibility_status"],
      },
    },
    hazards: {
      type: "array",
      description:
        "Visible objects dangerous in THIS scenario. Reason must cite the scenario mechanism.",
      items: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Specific visible object (e.g. tall unsecured bookshelf).",
          },
          reason: {
            type: "string",
            description: "Why it is hazardous in this scenario.",
          },
          coordinates: BBOX,
        },
        required: ["description", "reason", "coordinates"],
      },
    },
    safe_zones: {
      type: "array",
      description:
        "Legitimate cover or concealment only. Empty array if none qualify. NEVER open floor or under open-sided desks. Hiding Spot = true concealment (closet, stall, behind solid partition). Drop & Cover = sturdy fixed desk/table top.",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["Hiding Spot", "Cover", "Drop & Cover"],
          },
          description: {
            type: "string",
            description:
              "Name the physical object providing cover/concealment and why it helps this scenario.",
          },
          effectiveness_rating: {
            type: "string",
            enum: ["High", "Medium", "Low"],
            description: "High = solid fixed mass or enclosed concealment.",
          },
          coordinates: BBOX,
        },
        required: ["type", "description", "effectiveness_rating", "coordinates"],
      },
    },
    actionable_instructions: {
      type: "array",
      description: "3-6 ordered, imperative survival steps. One sentence each.",
      items: { type: "string" },
    },
    room_model: {
      type: "object",
      description:
        "Synthesized TOP-DOWN floor plan. REQUIRED for 360° video scans; omit for single photos.",
      properties: {
        walls: {
          type: "array",
          description: "Wall segments, each a pair of points [[x1,y1],[x2,y2]].",
          items: { type: "array", items: POINT2D, minItems: 2, maxItems: 2 },
        },
        landmarks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              type: {
                type: "string",
                enum: [
                  "exit",
                  "door",
                  "window",
                  "hazard",
                  "safe_zone",
                  "furniture",
                ],
              },
              position: POINT2D,
              detail: { type: "string" },
            },
            required: ["label", "type", "position"],
          },
        },
        exit_path: {
          type: "array",
          description: "3+ waypoints from scan_origin to the primary exit.",
          items: POINT2D,
        },
        scan_origin: POINT2D,
      },
      required: ["walls", "landmarks", "exit_path", "scan_origin"],
    },
  },
  required: [
    "egress_points",
    "hazards",
    "safe_zones",
    "actionable_instructions",
  ],
} as const;

/**
 * Forced-tool config: the model MUST call `emit_safety_plan`, returning
 * arguments that conform to the schema above. This is the reliable structured
 * output path for both Claude and Nova.
 */
export const SAFETY_PLAN_TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: SAFETY_PLAN_TOOL_NAME,
        description:
          "Return the spatial emergency safety plan for the room as structured data. Always call this tool exactly once.",
        // The SDK types `json` as a loose smithy Document; our schema satisfies it.
        inputSchema: { json: SAFETY_PLAN_SCHEMA as unknown as DocumentType },
      },
    },
  ],
  toolChoice: { tool: { name: SAFETY_PLAN_TOOL_NAME } },
};

/**
 * Pull the structured tool arguments out of a Converse response. Falls back to
 * `null` if the model returned text instead of a tool call (caller can then try
 * to parse raw JSON from any text block).
 */
export function extractToolInput(
  content: ContentBlock[] | undefined,
): unknown | null {
  if (!content) return null;
  for (const block of content) {
    if ("toolUse" in block && block.toolUse?.name === SAFETY_PLAN_TOOL_NAME) {
      return block.toolUse.input ?? null;
    }
  }
  return null;
}
