/**
 * Bedrock Converse "tool use" definition for SafeSpace.
 *
 * Phase 1: Rekognition + YOLO produce bounding boxes.
 * Phase 2: VLM selects detection ids and writes scenario reasoning only.
 */

import type {
  ContentBlock,
  ToolConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import type { DocumentType } from "@smithy/types";
import type { RoomModel } from "@/lib/types";

export const SAFETY_PLAN_TOOL_NAME = "emit_safety_plan";

const POINT2D = {
  type: "array",
  description: "[x, y] on the top-down floor plan, each 0.0-1.0 (0,0 = top-left).",
  items: { type: "number" },
  minItems: 2,
  maxItems: 2,
} as const;

/** VLM output — references pre-detected objects by id (no invented bboxes). */
export interface SafetyPlanSelection {
  egress_selections?: Array<{
    detection_id: string;
    type: "Primary Door" | "Secondary Door" | "Window";
    accessibility_status: "Clear" | "Partially Blocked" | "Blocked";
  }>;
  safe_zone_selections?: Array<{
    detection_id: string;
    type: "Hiding Spot" | "Cover" | "Drop & Cover";
    description: string;
    effectiveness_rating: "High" | "Medium" | "Low";
  }>;
  hazard_selections?: Array<{
    detection_id: string;
    reason: string;
    description?: string;
  }>;
  actionable_instructions: string[];
  room_model?: RoomModel;
}

const SAFETY_PLAN_SCHEMA = {
  type: "object",
  properties: {
    egress_selections: {
      type: "array",
      description:
        "Exits chosen from detections with category egress_door or egress_window. One Primary Door max.",
      items: {
        type: "object",
        properties: {
          detection_id: {
            type: "string",
            description: "Id from the DETECTIONS list (e.g. det-1).",
          },
          type: {
            type: "string",
            enum: ["Primary Door", "Secondary Door", "Window"],
          },
          accessibility_status: {
            type: "string",
            enum: ["Clear", "Partially Blocked", "Blocked"],
          },
        },
        required: ["detection_id", "type", "accessibility_status"],
      },
    },
    hazard_selections: {
      type: "array",
      description:
        "Hazards chosen from detections (especially structure, fixture, glass furniture).",
      items: {
        type: "object",
        properties: {
          detection_id: { type: "string" },
          reason: { type: "string" },
          description: { type: "string" },
        },
        required: ["detection_id", "reason"],
      },
    },
    safe_zone_selections: {
      type: "array",
      description:
        "Safe zones from furniture detections only. Drop & Cover = desk/table on floor. Empty if none.",
      items: {
        type: "object",
        properties: {
          detection_id: { type: "string" },
          type: {
            type: "string",
            enum: ["Hiding Spot", "Cover", "Drop & Cover"],
          },
          description: { type: "string" },
          effectiveness_rating: {
            type: "string",
            enum: ["High", "Medium", "Low"],
          },
        },
        required: ["detection_id", "type", "description", "effectiveness_rating"],
      },
    },
    actionable_instructions: {
      type: "array",
      description: "3-6 ordered imperative steps referencing selected detection labels.",
      items: { type: "string" },
    },
    room_model: {
      type: "object",
      description: "Top-down floor plan. REQUIRED for 360° scans only.",
      properties: {
        walls: {
          type: "array",
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
        exit_path: { type: "array", items: POINT2D },
        scan_origin: POINT2D,
      },
      required: ["walls", "landmarks", "exit_path", "scan_origin"],
    },
  },
  required: ["actionable_instructions"],
} as const;

export const SAFETY_PLAN_TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: SAFETY_PLAN_TOOL_NAME,
        description:
          "Select from the provided DETECTION list by id and return scenario reasoning. Never invent detection ids or coordinates.",
        inputSchema: { json: SAFETY_PLAN_SCHEMA as unknown as DocumentType },
      },
    },
  ],
  toolChoice: { tool: { name: SAFETY_PLAN_TOOL_NAME } },
};

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
