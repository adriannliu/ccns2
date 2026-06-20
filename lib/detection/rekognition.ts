import {
  DetectLabelsCommand,
  RekognitionClient,
  type Label,
} from "@aws-sdk/client-rekognition";
import type { BBox } from "@/lib/types";
import { getS3Bucket } from "@/lib/s3";
import type { ImageSource } from "@/lib/analyzeInput";
import { categorizeLabel } from "./labelMap";
import type { SpatialDetection } from "./types";

const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const MIN_CONFIDENCE = Number(process.env.REKOGNITION_MIN_CONFIDENCE ?? 75);

function rekognitionBoxToBBox(box: {
  Left?: number;
  Top?: number;
  Width?: number;
  Height?: number;
}): BBox | null {
  const left = box.Left ?? NaN;
  const top = box.Top ?? NaN;
  const width = box.Width ?? NaN;
  const height = box.Height ?? NaN;
  if ([left, top, width, height].some((n) => Number.isNaN(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return [top, left, top + height, left + width];
}

function instancesFromLabel(label: Label, prefix: string): SpatialDetection[] {
  const name = label.Name ?? "Object";
  const category = categorizeLabel(name);
  const out: SpatialDetection[] = [];

  for (const [i, inst] of (label.Instances ?? []).entries()) {
    const bbox = rekognitionBoxToBBox(inst.BoundingBox ?? {});
    if (!bbox) continue;
    const confidence = inst.Confidence ?? label.Confidence ?? 0;
    if (confidence < MIN_CONFIDENCE) continue;
    out.push({
      id: `${prefix}-${name}-${i}`,
      label: name,
      category,
      source: "rekognition",
      confidence: confidence / 100,
      coordinates: bbox,
    });
  }

  return out;
}

async function rekognitionImage(source: ImageSource) {
  if (source.kind === "s3") {
    const bucket = getS3Bucket();
    if (!bucket) throw new Error("S3_BUCKET is required for Rekognition on S3 objects.");
    return { Image: { S3Object: { Bucket: bucket, Name: source.key } } };
  }

  const base64 = source.image.includes(",")
    ? source.image.slice(source.image.indexOf(",") + 1)
    : source.image;
  return { Image: { Bytes: Buffer.from(base64, "base64") } };
}

export async function detectWithRekognition(
  source: ImageSource,
): Promise<SpatialDetection[]> {
  const client = new RekognitionClient({ region: AWS_REGION });
  const image = await rekognitionImage(source);
  const res = await client.send(
    new DetectLabelsCommand({
      ...image,
      MaxLabels: 50,
      MinConfidence: MIN_CONFIDENCE,
    }),
  );

  const detections: SpatialDetection[] = [];
  for (const label of res.Labels ?? []) {
    detections.push(...instancesFromLabel(label, "rk"));
  }
  return detections;
}
