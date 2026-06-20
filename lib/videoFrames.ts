/**
 * Client-side helpers for 360° room scans captured as video (iPhone MOV/MP4).
 * Samples evenly spaced frames and builds a simple horizontal panorama strip.
 */

export interface VideoScanResult {
  /** Individual frame data URLs (JPEG), ordered by capture time. */
  frames: string[];
  /** Wide stitched panorama for preview / overlay reference. */
  panorama: string;
  durationSec: number;
}

const DEFAULT_FRAME_COUNT = 10;
const FRAME_MAX_WIDTH = 640;
const JPEG_QUALITY = 0.72;

function loadVideoMetadata(file: File): Promise<{
  video: HTMLVideoElement;
  url: string;
  duration: number;
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read video duration."));
        return;
      }
      resolve({ video, url, duration: video.duration });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load that video file."));
    };
  });
}

function seekVideo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    video.currentTime = timeSec;
    video.onerror = () => reject(new Error("Failed while reading video frames."));
  });
}

function captureFrame(
  video: HTMLVideoElement,
  maxWidth: number,
): string {
  const scale = Math.min(1, maxWidth / Math.max(video.videoWidth, 1));
  const w = Math.max(1, Math.round(video.videoWidth * scale));
  const h = Math.max(1, Math.round(video.videoHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");
  ctx.drawImage(video, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/** Grab a single preview frame for the scan-page thumbnail (matches old photo UI). */
export async function extractVideoPreview(file: File): Promise<string> {
  if (!file.type.startsWith("video/")) {
    throw new Error("Please use a video file (MOV or MP4 from your iPhone).");
  }

  const { video, url, duration } = await loadVideoMetadata(file);

  try {
    const t = Math.max(duration * 0.15, 0);
    await seekVideo(video, t);
    return captureFrame(video, FRAME_MAX_WIDTH);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

export async function stitchPanoramaAsync(frames: string[]): Promise<string> {
  if (frames.length === 0) return "";
  if (frames.length === 1) return frames[0];

  const imgs = await Promise.all(
    frames.map(
      (src) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Failed to stitch panorama."));
          img.src = src;
        }),
    ),
  );

  const h = Math.max(...imgs.map((i) => i.height));
  const w = imgs.reduce((sum, i) => sum + Math.round((i.width / i.height) * h), 0);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable.");

  let x = 0;
  for (const img of imgs) {
    const sliceW = Math.round((img.width / img.height) * h);
    ctx.drawImage(img, x, 0, sliceW, h);
    x += sliceW;
  }

  return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
}

/**
 * Sample `frameCount` frames evenly across the video and build a panorama strip.
 * Works with iPhone slow-pan room scans (regular video, not equirectangular).
 */
export async function extractVideoScan(
  file: File,
  frameCount = DEFAULT_FRAME_COUNT,
): Promise<VideoScanResult> {
  if (!file.type.startsWith("video/")) {
    throw new Error("Please use a video file (MOV or MP4 from your iPhone).");
  }

  const { video, url, duration } = await loadVideoMetadata(file);

  try {
    const count = Math.max(4, Math.min(frameCount, 12));
    const frames: string[] = [];

    // Skip first/last 5% to avoid shaky start/stop.
    const start = duration * 0.05;
    const end = duration * 0.95;
    const span = Math.max(end - start, 0.1);

    for (let i = 0; i < count; i++) {
      const t = start + (span * i) / Math.max(count - 1, 1);
      await seekVideo(video, t);
      frames.push(captureFrame(video, FRAME_MAX_WIDTH));
    }

    const panorama = await stitchPanoramaAsync(frames);
    return { frames, panorama, durationSec: duration };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}
