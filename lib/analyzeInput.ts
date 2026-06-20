import { createDownloadUrl, isS3Configured } from "@/lib/s3";
import type { ScanMode } from "@/lib/types";

export type ImageSource =
  | { kind: "s3"; key: string; contentType?: string }
  | { kind: "inline"; image: string };

export type AnalyzeInput = {
  mode: ScanMode;
  sources: ImageSource[];
};

export interface CapturePayload {
  scanMode?: ScanMode;
  image?: string;
  imageKey?: string;
  imageContentType?: string;
  frames?: string[];
  frameKeys?: string[];
}

/** Build model input + optional display URL from a scan/upload payload. */
export function buildAnalyzeInput(body: CapturePayload): {
  input: AnalyzeInput;
  imageUrl?: string;
} {
  const { image, imageKey, imageContentType, frames, frameKeys } = body;
  const scanMode =
    body.scanMode ??
    (frames?.length || frameKeys?.length ? "video360" : "photo");

  function sourcesFromFrames(): ImageSource[] | null {
    if (frameKeys?.length && isS3Configured()) {
      return frameKeys.map((key) => ({
        kind: "s3" as const,
        key,
        contentType: "image/jpeg",
      }));
    }
    if (frames?.length) {
      return frames.map((f) => ({ kind: "inline" as const, image: f }));
    }
    return null;
  }

  let input: AnalyzeInput;
  let imageUrl: string | undefined;

  if (scanMode === "video360") {
    const sources = sourcesFromFrames();
    if (!sources?.length) {
      throw new Error("Provide `frames` or `frameKeys` for a 360° video scan.");
    }
    input = { mode: "video360", sources };
  } else {
    const fromFrames = sourcesFromFrames();
    if (fromFrames?.length) {
      input = { mode: "photo", sources: fromFrames };
    } else if (imageKey && isS3Configured()) {
      input = {
        mode: "photo",
        sources: [
          { kind: "s3", key: imageKey, contentType: imageContentType },
        ],
      };
    } else if (image && typeof image === "string") {
      input = { mode: "photo", sources: [{ kind: "inline", image }] };
    } else {
      throw new Error(
        "Provide `image`/`imageKey`, or `frames`/`frameKeys` for photos.",
      );
    }
  }

  return { input, imageUrl };
}

export async function resolveDisplayImageUrl(
  input: AnalyzeInput,
  imageUrl?: string,
): Promise<string | undefined> {
  if (imageUrl) return imageUrl;
  if (input.sources[0]?.kind === "s3" && isS3Configured()) {
    return createDownloadUrl(input.sources[0].key).catch(() => undefined);
  }
  if (input.sources[0]?.kind === "inline") {
    return input.sources[0].image;
  }
  return undefined;
}

/** Resolve display URLs for each sampled video frame. */
export async function resolveFrameImageUrls(
  body: CapturePayload,
  sources: ImageSource[],
): Promise<{ urls: string[]; keys?: string[] }> {
  if (body.frameKeys?.length && isS3Configured()) {
    const urls = await Promise.all(
      body.frameKeys.map((key) => createDownloadUrl(key)),
    );
    return { urls, keys: body.frameKeys };
  }
  if (body.frames?.length) {
    return { urls: body.frames };
  }

  const urls: string[] = [];
  const keys: string[] = [];
  for (const src of sources) {
    if (src.kind === "inline") {
      urls.push(src.image);
    } else if (src.kind === "s3" && isS3Configured()) {
      urls.push(await createDownloadUrl(src.key));
      keys.push(src.key);
    }
  }
  return keys.length > 0 ? { urls, keys } : { urls };
}
