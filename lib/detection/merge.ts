import { bboxIoU } from "@/lib/bbox";
import type { SpatialDetection } from "./types";

/** Merge overlapping detections; keep highest confidence per cluster. */
export function mergeDetections(detections: SpatialDetection[]): SpatialDetection[] {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept: SpatialDetection[] = [];

  for (const det of sorted) {
    const dup = kept.find(
      (k) =>
        k.category === det.category &&
        bboxIoU(k.coordinates, det.coordinates) > 0.45,
    );
    if (!dup) kept.push(det);
  }

  return kept.map((d, i) => ({ ...d, id: `det-${i + 1}` }));
}
