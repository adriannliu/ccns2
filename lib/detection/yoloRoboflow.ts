import type { BBox } from "@/lib/types";
import type { ImageSource } from "@/lib/analyzeInput";
import { getObjectBytes } from "@/lib/s3";
import { categorizeLabel } from "./labelMap";
import type { SpatialDetection } from "./types";

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY ?? "";
const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL ?? "coco-1280/4";
const MIN_CONFIDENCE = Number(process.env.YOLO_MIN_CONFIDENCE ?? 0.4);

interface RoboflowPrediction {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RoboflowResponse {
  image?: { width: number; height: number };
  predictions?: RoboflowPrediction[];
}

async function loadImageBase64(source: ImageSource): Promise<string> {
  if (source.kind === "inline") {
    const raw = source.image.includes(",")
      ? source.image.slice(source.image.indexOf(",") + 1)
      : source.image;
    return raw;
  }
  const bytes = await getObjectBytes(source.key);
  return Buffer.from(bytes).toString("base64");
}

function roboflowBoxToBBox(
  pred: RoboflowPrediction,
  imgW: number,
  imgH: number,
): BBox {
  const xmin = (pred.x - pred.width / 2) / imgW;
  const xmax = (pred.x + pred.width / 2) / imgW;
  const ymin = (pred.y - pred.height / 2) / imgH;
  const ymax = (pred.y + pred.height / 2) / imgH;
  return [
    clamp01(ymin),
    clamp01(xmin),
    clamp01(ymax),
    clamp01(xmax),
  ];
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function isYoloConfigured(): boolean {
  return Boolean(ROBOFLOW_API_KEY && ROBOFLOW_MODEL);
}

/** Run Roboflow-hosted YOLO (COCO-style classes). Optional — skipped when unconfigured. */
export async function detectWithYolo(source: ImageSource): Promise<SpatialDetection[]> {
  if (!isYoloConfigured()) return [];

  const base64 = await loadImageBase64(source);
  const url = `https://detect.roboflow.com/${ROBOFLOW_MODEL}?api_key=${encodeURIComponent(ROBOFLOW_API_KEY)}&confidence=${Math.round(MIN_CONFIDENCE * 100)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: base64,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Roboflow YOLO failed (${res.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as RoboflowResponse;
  const imgW = data.image?.width ?? 1;
  const imgH = data.image?.height ?? 1;

  const detections: SpatialDetection[] = [];
  for (const [i, pred] of (data.predictions ?? []).entries()) {
    if (pred.confidence < MIN_CONFIDENCE) continue;
    const category = categorizeLabel(pred.class);
    // Skip generic COCO clutter that never belongs on our map.
    if (category === "other" && pred.confidence < 0.55) continue;

    detections.push({
      id: `yolo-${pred.class}-${i}`,
      label: pred.class,
      category,
      source: "yolo",
      confidence: pred.confidence,
      coordinates: roboflowBoxToBBox(pred, imgW, imgH),
    });
  }

  return detections;
}
