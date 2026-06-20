"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  ImageUp,
  Loader2,
  RefreshCw,
  ScanLine,
  Video,
} from "lucide-react";
import { SCENARIOS } from "@/lib/scenarios";
import type { AnalyzeResponse, ScanMode, Scenario } from "@/lib/types";
import { saveScan } from "@/lib/scanStore";
import { extractVideoPreview, extractVideoScan } from "@/lib/videoFrames";

type CaptureTab = ScanMode;

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
  const [captureTab, setCaptureTab] = useState<CaptureTab>("photo");
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function clearCapture() {
    setPreview(null);
    setFile(null);
    setError(null);
  }

  function switchTab(tab: CaptureTab) {
    if (tab === captureTab) return;
    setCaptureTab(tab);
    clearCapture();
  }

  async function loadPhotoFile(next: File) {
    if (!next.type.startsWith("image/")) {
      setError("Please use an image file (JPEG, PNG, etc.).");
      return;
    }
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(next);
      setPreview(dataUrl);
      setFile(next);
    } catch {
      setError("Could not read that image. Try another photo.");
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
      setPreview(frame);
      setFile(next);
    } catch {
      setError("Could not read that video. Try another recording.");
    }
  }

  async function loadFile(next: File) {
    if (captureTab === "photo") {
      await loadPhotoFile(next);
    } else {
      await loadVideoFile(next);
    }
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

  async function uploadFramesToS3(
    frames: string[],
  ): Promise<string[] | null> {
    const keys: string[] = [];
    for (let i = 0; i < frames.length; i++) {
      const res = await fetch(frames[i]);
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
    const next = e.target.files?.[0];
    if (!next) return;
    await loadFile(next);
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
    const next = e.dataTransfer.files?.[0];
    if (next) void loadFile(next);
  }

  const dropZoneActive = dragOver
    ? "border-emerald-400 bg-emerald-500/10 ring-2 ring-emerald-500/30"
    : "border-slate-700 bg-slate-900/40 hover:border-emerald-500/60 hover:bg-slate-900/70";

  async function runPhotoAnalysis() {
    if (!preview || !file) return;

    const uploaded = await uploadToS3(file);
    const payload = uploaded
      ? {
          scenario,
          scanMode: "photo" as const,
          imageKey: uploaded.key,
          imageContentType: uploaded.contentType,
        }
      : { scenario, scanMode: "photo" as const, image: preview };

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
      image: result.imageUrl ?? preview,
      scanMode: "photo",
      scenario,
      result,
      createdAt: Date.now(),
    });
    router.push("/results");
  }

  async function runVideoAnalysis() {
    if (!preview || !file) return;

    const scan = await extractVideoScan(file);
    const frameKeys = await uploadFramesToS3(scan.frames);

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
    if (!preview || !file) return;
    setLoading(true);
    setError(null);

    try {
      if (captureTab === "photo") {
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

  const isPhoto = captureTab === "photo";

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-28 pt-6">
      {/* Header */}
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

      {/* Step 1 — Scenario */}
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

      {/* Step 2 — Capture */}
      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          2 · Capture the room
        </h2>

        {/* Photo / Video tabs */}
        <div
          role="tablist"
          aria-label="Capture type"
          className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-900/50 p-1"
        >
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
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={isPhoto ? "image/*" : "video/*"}
          capture="environment"
          onChange={handleFile}
          className="hidden"
        />

        {!preview ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
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
                  ? "Drop image here"
                  : "Drop video here"
                : isPhoto
                  ? "Open camera"
                  : "Record 360° scan"}
            </span>
            <span className="max-w-[260px] text-center text-xs text-slate-500">
              {isPhoto
                ? "tap to choose a photo, or drag and drop"
                : "slowly pan a full circle around the room, or upload a video"}
            </span>
          </button>
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
                src={preview}
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
              onClick={() => fileInputRef.current?.click()}
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

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-slate-800 bg-slate-950/90 px-5 py-4 backdrop-blur">
        <button
          onClick={runAnalysis}
          disabled={!preview || loading}
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
        {!preview ? (
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-slate-500">
            <ImageUp className="h-3.5 w-3.5" />
            {isPhoto
              ? "Capture, choose, or drag in a photo to enable analysis"
              : "Record or upload a 360° video to enable analysis"}
          </p>
        ) : null}
      </div>
    </main>
  );
}
