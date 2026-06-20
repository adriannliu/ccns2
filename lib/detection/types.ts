import type { BBox } from "@/lib/types";

export type DetectionSource = "rekognition" | "yolo";

/** Semantic bucket used to constrain VLM selections. */
export type DetectionCategory =
  | "egress_door"
  | "egress_window"
  | "furniture"
  | "structure"
  | "fixture"
  | "other";

export interface SpatialDetection {
  id: string;
  label: string;
  category: DetectionCategory;
  source: DetectionSource;
  confidence: number;
  coordinates: BBox;
}

export interface DetectionRunResult {
  detections: SpatialDetection[];
  sources: DetectionSource[];
}
