import { randomUUID } from "crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ImageFormat } from "@aws-sdk/client-bedrock-runtime";

/**
 * S3 helpers for the SafeSpace scan pipeline.
 *
 * Flow:
 *  1. Client asks /api/upload for a presigned PUT URL.
 *  2. Client uploads the photo bytes DIRECTLY to S3 (bypasses our serverless
 *     function body limit and Bedrock's ~5MB inline-image cap).
 *  3. /api/analyze passes the S3 object to Bedrock Converse via `s3Location`
 *     and returns a presigned GET URL for the results page to display.
 */

const REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? "us-east-1";
const BUCKET = process.env.S3_BUCKET ?? "";
const PREFIX = process.env.S3_PREFIX ?? "scans";
const ACCOUNT_ID = process.env.AWS_ACCOUNT_ID ?? "";

const UPLOAD_URL_TTL = 60; // seconds the client has to start the PUT
const DOWNLOAD_URL_TTL = 60 * 60; // 1h for the results page to render

export function isS3Configured(): boolean {
  return Boolean(BUCKET);
}

export function getS3Bucket(): string {
  return BUCKET;
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) _client = new S3Client({ region: REGION });
  return _client;
}

/** Map a browser content type to a Bedrock-supported image format. */
export function contentTypeToImageFormat(
  contentType: string | undefined,
): ImageFormat {
  switch ((contentType ?? "").toLowerCase()) {
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "jpeg";
  }
}

function extForContentType(contentType: string | undefined): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("video/")) {
    if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
    return "mp4";
  }
  return contentTypeToImageFormat(contentType);
}

/** Generate a fresh, namespaced object key for a new upload. */
export function newScanKey(contentType: string | undefined): string {
  return `${PREFIX}/${randomUUID()}.${extForContentType(contentType)}`;
}

/** Generate keys for sampled video frames. */
export function newFrameKey(index: number): string {
  return `${PREFIX}/frames/${randomUUID()}-${index}.jpeg`;
}

/** Presigned PUT URL the browser uses to upload the photo directly to S3. */
export async function createUploadUrl(
  key: string,
  contentType: string,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), command, { expiresIn: UPLOAD_URL_TTL });
}

/** Fetch raw object bytes (Rekognition/YOLO on inline fallback paths). */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const res = await client().send(command);
  const body = res.Body;
  if (!body) throw new Error(`S3 object empty: ${key}`);
  return body.transformToByteArray();
}

/** Presigned GET URL so the results page can render the stored image. */
export async function createDownloadUrl(key: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(client(), command, { expiresIn: DOWNLOAD_URL_TTL });
}

/** The `s3://bucket/key` URI + owner that Bedrock Converse consumes. */
export function s3Location(key: string): {
  uri: string;
  bucketOwner?: string;
} {
  return {
    uri: `s3://${BUCKET}/${key}`,
    bucketOwner: ACCOUNT_ID || undefined,
  };
}

/**
 * Live PUT -> GET -> DELETE round-trip against the bucket to verify the app's
 * credentials can actually read and write objects. Returns ok/error for /api/health.
 */
export async function s3RoundTrip(): Promise<{ ok: boolean; error?: string }> {
  if (!isS3Configured()) return { ok: false, error: "S3_BUCKET is not set." };

  const key = `${PREFIX}/_healthcheck/${randomUUID()}.txt`;
  const c = client();
  try {
    await c.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: "ok",
        ContentType: "text/plain",
      }),
    );
    const got = await c.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    const body = await got.Body?.transformToString();
    if (body !== "ok") {
      return { ok: false, error: "Read-back mismatch." };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "S3 error" };
  } finally {
    // Best-effort cleanup; ignore failures.
    await c
      .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
      .catch(() => undefined);
  }
}
