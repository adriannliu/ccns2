import { NextResponse } from "next/server";
import { createUploadUrl, isS3Configured, newScanKey } from "@/lib/s3";

export const runtime = "nodejs";

interface UploadRequest {
  contentType?: string;
}

/**
 * POST /api/upload
 * Issues a presigned S3 PUT URL so the browser can upload the scan photo
 * directly to S3 (keeping large bytes out of our serverless function).
 *
 * Returns 501 when S3 isn't configured so the client can fall back to inline
 * base64 upload through /api/analyze.
 */
export async function POST(req: Request) {
  if (!isS3Configured()) {
    return NextResponse.json(
      { error: "S3 is not configured.", configured: false },
      { status: 501 },
    );
  }

  let body: UploadRequest;
  try {
    body = (await req.json()) as UploadRequest;
  } catch {
    body = {};
  }

  const contentType = body.contentType || "image/jpeg";
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/")) {
    return NextResponse.json(
      { error: "contentType must be image/* or video/*." },
      { status: 400 },
    );
  }

  try {
    const key = newScanKey(contentType);
    const uploadUrl = await createUploadUrl(key, contentType);
    return NextResponse.json({ uploadUrl, key, contentType });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not create upload URL.",
      },
      { status: 500 },
    );
  }
}
