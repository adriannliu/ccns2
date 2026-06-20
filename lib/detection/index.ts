import type { ImageSource } from "@/lib/analyzeInput";
import { mergeDetections } from "./merge";
import { detectWithRekognition } from "./rekognition";
import { detectWithYolo, isYoloConfigured } from "./yoloRoboflow";
import type { DetectionRunResult, SpatialDetection } from "./types";

export type { DetectionRunResult, SpatialDetection, DetectionCategory } from "./types";
export { categoryHint } from "./labelMap";

/** Mock detections for offline demo (matches mockAnalysis layout). */
export function mockDetections(): SpatialDetection[] {
  return mergeDetections([
    {
      id: "det-1",
      label: "Door",
      category: "egress_door",
      source: "rekognition",
      confidence: 0.92,
      coordinates: [0.32, 0.04, 0.86, 0.2],
    },
    {
      id: "det-2",
      label: "Window",
      category: "egress_window",
      source: "rekognition",
      confidence: 0.88,
      coordinates: [0.28, 0.74, 0.62, 0.95],
    },
    {
      id: "det-3",
      label: "Desk",
      category: "furniture",
      source: "yolo",
      confidence: 0.85,
      coordinates: [0.62, 0.42, 0.92, 0.7],
    },
    {
      id: "det-4",
      label: "Shelf",
      category: "furniture",
      source: "rekognition",
      confidence: 0.8,
      coordinates: [0.18, 0.4, 0.5, 0.58],
    },
  ]);
}

/**
 * Run Rekognition + optional Roboflow YOLO on the overlay frame, merge and dedupe.
 */
export async function runObjectDetection(
  source: ImageSource,
): Promise<DetectionRunResult> {
  const sources: DetectionRunResult["sources"] = [];
  const raw: SpatialDetection[] = [];

  try {
    raw.push(...(await detectWithRekognition(source)));
    sources.push("rekognition");
  } catch (err) {
    console.error("[detection] Rekognition failed:", err);
  }

  if (isYoloConfigured()) {
    try {
      raw.push(...(await detectWithYolo(source)));
      sources.push("yolo");
    } catch (err) {
      console.error("[detection] YOLO failed:", err);
    }
  }

  return { detections: mergeDetections(raw), sources };
}

export function formatDetectionsForPrompt(detections: SpatialDetection[]): string {
  if (!detections.length) {
    return "DETECTIONS: none — return empty selections. Do not invent objects.";
  }

  const lines = detections.map(
    (d) =>
      `- ${d.id}: ${d.label} (${d.category}, ${d.source}, conf=${d.confidence.toFixed(2)}) bbox=[${d.coordinates.map((n) => n.toFixed(3)).join(", ")}]`,
  );
  return `DETECTIONS (select ONLY by id — coordinates come from these, never invent new boxes):\n${lines.join("\n")}`;
}
