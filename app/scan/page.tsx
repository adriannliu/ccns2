"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ImageUp,
  Loader2,
  Plus,
  RefreshCw,
  ScanLine,
  Video,
  X,
} from "lucide-react";
import { SCENARIOS } from "@/lib/scenarios";
import type { AnalyzeResponse, ScanMode, Scenario } from "@/lib/types";
import { saveScan } from "@/lib/scanStore";
import { extractVideoPreview, extractVideoScan } from "@/lib/videoFrames";

type CaptureTab = ScanMode;

interface PhotoItem {
  preview: string;
  file: File;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ScanPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [scenario, setScenario] = useState<Scenario>("FIRE");
  const [captureTab, setCaptureTab] = useState<CaptureTab>("video360");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const isPhoto = captureTab === "photo";
  const hasCapture = isPhoto ? photos.length > 0 : Boolean(videoPreview);

  function clearCapture() {
    setPhotos([]);
    setVideoPreview(null);
    setVideoFile(null);
    setError(null);
  }

  function switchTab(tab: CaptureTab) {
    if (tab === captureTab) return;
    setCaptureTab(tab);
    clearCapture();
  }

  async function addPhotoFiles(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      setError("Please use image files (JPEG, PNG, etc.).");
      return;
    }
    setError(null);
    try {
      const items = await Promise.all(
        list.map(async (file) => ({
          file,
          preview: await fileToDataUrl(file),
        })),
      );
      setPhotos((prev) => [...prev, ...items]);
    } catch {
      setError("Could not read one of those images. Try again.");
    }
  }

  async function loadVideoFile(next: File) {
    if (!next.type.startsWith("video/")) {
      setError("Please use a video file (iPhone MOV or MP4).");
      return;
    }
    setError(null);
    try {
      const frame = await extractVideoPreview(next);
      setVideoPreview(frame);
      setVideoFile(next);
    } catch {
      setError("Could not read that video. Try another recording.");
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function uploadToS3(
    blob: File,
  ): Promise<{ key: string; contentType: string } | null> {
    const presign = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: blob.type || "image/jpeg" }),
    });

    if (presign.status === 501) return null;
    if (!presign.ok) {
      const body = await presign.json().catch(() => ({}));
      throw new Error(body?.error ?? `Upload URL failed (${presign.status})`);
    }

    const { uploadUrl, key, contentType } = (await presign.json()) as {
      uploadUrl: string;
      key: string;
      contentType: string;
    };

    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!put.ok) {
      throw new Error(`S3 upload failed (${put.status})`);
    }

    return { key, contentType };
  }

  async function uploadDataUrlsToS3(
    dataUrls: string[],
  ): Promise<string[] | null> {
    const keys: string[] = [];
    for (let i = 0; i < dataUrls.length; i++) {
      const res = await fetch(dataUrls[i]);
      const blob = await res.blob();
      const uploaded = await uploadToS3(
        new File([blob], `frame-${i}.jpeg`, { type: "image/jpeg" }),
      );
      if (!uploaded) return null;
      keys.push(uploaded.key);
    }
    return keys;
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked?.length) return;
    if (isPhoto) {
      await addPhotoFiles(picked);
    } else {
      await loadVideoFile(picked[0]);
    }
    e.target.value = "";
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const dropped = e.dataTransfer.files;
    if (!dropped?.length) return;
    if (isPhoto) {
      void addPhotoFiles(dropped);
    } else {
      void loadVideoFile(dropped[0]);
    }
  }

  const dropZoneActive = dragOver
    ? "border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-500/30"
    : "border-slate-700 bg-slate-900/40 hover:border-emerald-500/60 hover:bg-slate-900/70";

  async function runPhotoAnalysis() {
    if (photos.length === 0) return;

    const previews = photos.map((p) => p.preview);

    if (photos.length === 1) {
      const uploaded = await uploadToS3(photos[0].file);
      const payload = uploaded
        ? {
            scenario,
            scanMode: "photo" as const,
            imageKey: uploaded.key,
            imageContentType: uploaded.contentType,
          }
        : { scenario, scanMode: "photo" as const, image: previews[0] };

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Analysis failed (${res.status})`);
      }

      const result = (await res.json()) as AnalyzeResponse;
      saveScan({
        image: result.imageUrl ?? previews[0],
        scanMode: "photo",
        scenario,
        result,
        createdAt: Date.now(),
      });
      router.push("/results");
      return;
    }

    const frameKeys = await uploadDataUrlsToS3(previews);
    const payload = frameKeys
      ? { scenario, scanMode: "photo" as const, frameKeys }
      : { scenario, scanMode: "photo" as const, frames: previews };

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Analysis failed (${res.status})`);
    }

    const result = (await res.json()) as AnalyzeResponse;
    saveScan({
      image: result.imageUrl ?? previews[0],
      scanMode: "photo",
      scenario,
      result,
      createdAt: Date.now(),
    });
    router.push("/results");
  }

  async function runVideoAnalysis() {
    if (!videoPreview || !videoFile) return;

    const scan = await extractVideoScan(videoFile);
    const frameKeys = await uploadDataUrlsToS3(scan.frames);

    const payload = frameKeys
      ? { scenario, scanMode: "video360" as const, frameKeys }
      : { scenario, scanMode: "video360" as const, frames: scan.frames };

    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `Analysis failed (${res.status})`);
    }

    const result = (await res.json()) as AnalyzeResponse;
    saveScan({
      image: result.imageUrl ?? scan.panorama,
      panorama: scan.panorama,
      scanMode: "video360",
      scenario,
      result,
      createdAt: Date.now(),
    });
    router.push("/results");
  }

  async function runAnalysis() {
    if (!hasCapture) return;
    setLoading(true);
    setError(null);

    try {
      if (isPhoto) {
        await runPhotoAnalysis();
      } else {
        await runVideoAnalysis();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
      setLoading(false);
    }
  }

  function openFilePicker(replace = false) {
    if (replace) clearCapture();
    fileInputRef.current?.click();
  }

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-28 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/"
          className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white"
          aria-label="Back to home"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Scan a space</h1>
          <p className="text-sm text-slate-400">
            Pick a scenario, then capture the room.
          </p>
        </div>
      </header>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          1 · Emergency scenario
        </h2>
        <div
          role="radiogroup"
          aria-label="Emergency scenario"
          className="grid grid-cols-3 gap-2"
        >
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const selected = scenario === s.id;
            return (
              <button
                key={s.id}
                role="radio"
                aria-checked={selected}
                onClick={() => setScenario(s.id)}
                className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${
                  selected
                    ? `${s.accent.bg} ${s.accent.border} ${s.accent.glow}`
                    : "border-slate-800 bg-slate-900/50 hover:border-slate-700"
                }`}
              >
                <Icon
                  className={`h-6 w-6 ${
                    selected ? s.accent.text : "text-slate-400"
                  }`}
                />
                <span
                  className={`text-xs font-semibold ${
                    selected ? "text-white" : "text-slate-300"
                  }`}
                >
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {SCENARIOS.find((s) => s.id === scenario)?.description}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          2 · Capture the room
        </h2>

        <div
          role="tablist"
          aria-label="Capture type"
          className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!isPhoto}
            onClick={() => switchTab("video360")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
              !isPhoto
                ? "bg-emerald-500 text-slate-950 shadow-neon"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Video className="h-4 w-4" />
            Video
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isPhoto}
            onClick={() => switchTab("photo")}
            className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition ${
              isPhoto
                ? "bg-emerald-500 text-slate-950 shadow-neon"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Camera className="h-4 w-4" />
            Photo
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={isPhoto ? "image/*" : "video/*"}
          capture="environment"
          multiple={isPhoto}
          onChange={handleFile}
          className="hidden"
        />

        {!hasCapture ? (
          <button
            type="button"
            onClick={() => openFilePicker()}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-14 text-slate-300 transition ${dropZoneActive}`}
          >
            {isPhoto ? (
              <Camera className="h-10 w-10 text-emerald-400" />
            ) : (
              <Video className="h-10 w-10 text-emerald-400" />
            )}
            <span className="font-semibold">
              {dragOver
                ? isPhoto
                  ? "Drop images here"
                  : "Drop video here"
                : isPhoto
                  ? "Open camera"
                  : "Record 360° scan"}
            </span>
            <span className="max-w-[260px] text-center text-xs text-slate-500">
              {isPhoto
                ? "choose one or more photos, or drag and drop"
                : "slowly pan a full circle around the room, or upload a video"}
            </span>
          </button>
        ) : isPhoto ? (
          <div className="space-y-3">
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative overflow-hidden rounded-2xl border-2 transition ${
                dragOver
                  ? "border-emerald-400 ring-2 ring-emerald-500/30"
                  : "border-slate-800"
              }`}
            >
              {photos.length === 1 ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photos[0].preview}
                  alt="Room preview"
                  className="max-h-[55vh] w-full object-contain"
                />
              ) : (
                <div className="grid grid-cols-2 gap-1 p-1">
                  {photos.map((photo, i) => (
                    <div key={i} className="relative aspect-[4/3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.preview}
                        alt={`Room photo ${i + 1}`}
                        className="h-full w-full rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        className="absolute right-1 top-1 rounded-full bg-slate-950/80 p-1 text-slate-300 transition hover:text-white"
                        aria-label={`Remove photo ${i + 1}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {dragOver ? (
                <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-[1px]">
                  <span className="rounded-xl bg-slate-950/80 px-4 py-2 text-sm font-semibold text-emerald-300">
                    Drop to add
                  </span>
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 py-3 text-sm font-medium text-slate-300 transition hover:text-white"
              >
                <Plus className="h-4 w-4" />
                Add photos
              </button>
              <button
                onClick={() => openFilePicker(true)}
                className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 py-3 text-sm font-medium text-slate-300 transition hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Start over
              </button>
            </div>
            {photos.length > 1 ? (
              <p className="text-center text-xs text-slate-500">
                {photos.length} photos selected
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative overflow-hidden rounded-2xl border-2 transition ${
                dragOver
                  ? "border-emerald-400 ring-2 ring-emerald-500/30"
                  : "border-slate-800"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={videoPreview!}
                alt="Room preview"
                className="max-h-[55vh] w-full object-contain"
              />
              {dragOver ? (
                <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20 backdrop-blur-[1px]">
                  <span className="rounded-xl bg-slate-950/80 px-4 py-2 text-sm font-semibold text-emerald-300">
                    Drop to replace
                  </span>
                </div>
              ) : null}
            </div>
            <button
              onClick={() => openFilePicker(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 py-3 text-sm font-medium text-slate-300 transition hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
              Retake / choose another
            </button>
          </div>
        )}
      </section>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-slate-800 bg-slate-950/90 px-5 py-4 backdrop-blur">
        <button
          onClick={runAnalysis}
          disabled={!hasCapture || loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-base font-bold text-slate-950 shadow-neon transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Analyzing space…
            </>
          ) : (
            <>
              <ScanLine className="h-5 w-5" />
              Run Spatial Analysis
            </>
          )}
        </button>
        {!hasCapture ? (
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-slate-500">
            <ImageUp className="h-3.5 w-3.5" />
            {isPhoto
              ? "Add one or more photos to enable analysis"
              : "Record or upload a 360° video to enable analysis"}
          </p>
        ) : null}
      </div>
    </main>
  );
}
