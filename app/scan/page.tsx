"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import type { SavedRoom, ScanMode } from "@/lib/types";
import { getRoomById, listRooms, rescanRoom, setupRoom } from "@/lib/roomLibrary";
import { isDuplicateRoomLabel } from "@/lib/roomLabel";
import { extractVideoScan } from "@/lib/videoFrames";
import SetupProgressPanel, {
  buildSetupSteps,
  createSetupProgressDriver,
  type SetupProgressState,
} from "@/components/SetupProgressPanel";
import SetupSuccessScreen from "@/components/SetupSuccessScreen";

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
  return (
    <Suspense
      fallback={
        <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </main>
      }
    >
      <ScanPageContent />
    </Suspense>
  );
}

function ScanPageContent() {
  const searchParams = useSearchParams();
  const rescanId = searchParams.get("rescan")?.trim() || null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [roomLabel, setRoomLabel] = useState("");
  const [existingRooms, setExistingRooms] = useState<SavedRoom[]>([]);
  const [captureTab, setCaptureTab] = useState<CaptureTab>("video360");
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [videoFrames, setVideoFrames] = useState<string[]>([]);
  const [videoPanorama, setVideoPanorama] = useState<string | null>(null);
  const [videoExtracting, setVideoExtracting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<SetupProgressState | null>(null);
  const [savedRoom, setSavedRoom] = useState<SavedRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rescanRoomMissing, setRescanRoomMissing] = useState(false);

  useEffect(() => {
    void listRooms().then(setExistingRooms);
  }, []);

  useEffect(() => {
    if (!rescanId) return;
    const existing = getRoomById(rescanId);
    if (!existing) {
      setRescanRoomMissing(true);
      return;
    }
    setRescanRoomMissing(false);
    setRoomLabel(existing.label);
    setCaptureTab(existing.scanMode);
  }, [rescanId]);

  const isPhoto = captureTab === "photo";
  const hasCapture = isPhoto ? photos.length > 0 : videoFrames.length > 0;
  const trimmedLabel = roomLabel.trim();
  const labelTaken = trimmedLabel
    ? isDuplicateRoomLabel(trimmedLabel, existingRooms, rescanId ?? undefined)
    : false;

  function clearCapture() {
    setPhotos([]);
    setVideoFrames([]);
    setVideoPanorama(null);
    setVideoExtracting(false);
    setError(null);
  }

  function switchTab(tab: CaptureTab) {
    if (tab === captureTab) return;
    if (hasCapture) {
      const ok = window.confirm(
        "Switching capture type will clear your current media. Continue?",
      );
      if (!ok) return;
    }
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
    setVideoExtracting(true);
    setVideoFrames([]);
    setVideoPanorama(null);
    try {
      const scan = await extractVideoScan(next);
      setVideoFrames(scan.frames);
      setVideoPanorama(scan.panorama);
    } catch {
      setError("Could not read that video. Try another recording.");
    } finally {
      setVideoExtracting(false);
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
    onFileUploaded?: (completed: number, total: number) => void,
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
      onFileUploaded?.(i + 1, dataUrls.length);
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

  async function runSetup() {
    if (!hasCapture || !trimmedLabel || labelTaken) return;
    setLoading(true);
    setError(null);
    setSavedRoom(null);

    const mediaCount = isPhoto ? photos.length : videoFrames.length;
    const { messages } = buildSetupSteps(isPhoto, mediaCount);
    const driver = createSetupProgressDriver(messages, setProgress);

    // First step after upload completes (before scenario plans).
    const analysisStartStep = !isPhoto
      ? 1
      : mediaCount > 1
        ? mediaCount
        : 1;

    try {
      const save = rescanId
        ? (payload: Record<string, unknown>, previews?: string[]) =>
            rescanRoom(rescanId, payload, previews)
        : setupRoom;

      let room: SavedRoom;

      if (isPhoto) {
        const previews = photos.map((p) => p.preview);
        if (photos.length === 1) {
          driver.setUploadProgress(0, 1);
          const uploaded = await uploadToS3(photos[0].file);
          driver.setUploadProgress(1, 1);
          driver.startAnalysisPhase(analysisStartStep);
          room = await save(
            {
              label: roomLabel.trim(),
              scanMode: "photo",
              previewImage: previews[0],
              ...(uploaded
                ? { imageKey: uploaded.key, imageContentType: uploaded.contentType }
                : { image: previews[0] }),
            },
            previews,
          );
        } else {
          const frameKeys = await uploadDataUrlsToS3(previews, (done, total) => {
            driver.setUploadProgress(done, total);
          });
          if (!frameKeys) {
            driver.setUploadProgress(previews.length, previews.length);
          }
          driver.startAnalysisPhase(analysisStartStep);
          room = await save(
            {
              label: roomLabel.trim(),
              scanMode: "photo",
              previewImage: previews[0],
              ...(frameKeys ? { frameKeys } : { frames: previews }),
            },
            previews,
          );
        }
      } else {
        driver.setUploadProgress(0, videoFrames.length);
        const frameKeys = await uploadDataUrlsToS3(videoFrames, (done, total) => {
          driver.setUploadProgress(done, total);
        });
        if (!frameKeys) {
          driver.setUploadProgress(videoFrames.length, videoFrames.length);
        }
        driver.startAnalysisPhase(analysisStartStep);
        room = await save(
          {
            label: roomLabel.trim(),
            scanMode: "video360",
            previewImage: videoFrames[0],
            panorama: videoPanorama ?? undefined,
            ...(frameKeys ? { frameKeys } : { frames: videoFrames }),
          },
          videoFrames,
        );
      }

      driver.finish();
      setSavedRoom(room);
      setProgress(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again.",
      );
      setProgress(null);
    } finally {
      driver.destroy();
      setLoading(false);
    }
  }

  function resetForAnotherRoom() {
    setSavedRoom(null);
    setRoomLabel("");
    clearCapture();
    setProgress(null);
    void listRooms().then(setExistingRooms);
  }

  if (savedRoom) {
    return (
      <SetupSuccessScreen
        room={savedRoom}
        rescanId={rescanId}
        onAddAnother={resetForAnotherRoom}
      />
    );
  }

  function openFilePicker(replace = false) {
    if (replace) clearCapture();
    fileInputRef.current?.click();
  }

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-36 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href={rescanId ? `/rooms/${rescanId}` : "/"}
          className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {rescanId ? "Re-scan room" : "Set up a room"}
          </h1>
          <p className="text-sm text-slate-400">
            {rescanId
              ? "Capture new media to replace this room’s plans."
              : "Label and scan — we'll map exits for every emergency."}
          </p>
        </div>
      </header>

      {rescanId && !rescanRoomMissing ? (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          Updating an existing room — your plans will be replaced when you save.
        </p>
      ) : null}

      {rescanRoomMissing ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          That room was not found.{" "}
          <Link href="/rooms" className="underline">
            Back to saved rooms
          </Link>
        </p>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          1 · Room name
        </h2>
        <input
          type="text"
          value={roomLabel}
          onChange={(e) => setRoomLabel(e.target.value)}
          placeholder="e.g. Room 201, Main office, Cafeteria"
          aria-invalid={labelTaken}
          className={`w-full rounded-xl border bg-slate-900/60 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 ${
            labelTaken
              ? "border-red-500/50 focus:border-red-500/60 focus:ring-red-500/40"
              : "border-slate-800 focus:border-emerald-500/60 focus:ring-emerald-500/40"
          }`}
        />
        {labelTaken ? (
          <p className="mt-2 text-sm text-red-300">
            A room named &ldquo;{trimmedLabel}&rdquo; already exists. Choose a
            different name.
          </p>
        ) : null}
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

        <ul className="mb-3 space-y-1 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3 text-xs text-slate-400">
          {isPhoto ? (
            <>
              <li>Include the main door and key furniture in frame</li>
              <li>Hold the phone at chest height, facing into the room</li>
              {photos.length > 1 ? (
                <li>Each photo will be labeled individually</li>
              ) : (
                <li>Add multiple photos for different angles</li>
              )}
            </>
          ) : (
            <>
              <li>Slowly pan a full circle at chest height</li>
              <li>Keep the camera steady — about 10 seconds total</li>
              <li>Include doors, windows, and major furniture</li>
            </>
          )}
        </ul>

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
        ) : videoExtracting ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 py-14 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            <p className="text-sm font-medium">Extracting frames from video…</p>
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
                src={videoFrames[0]}
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

            <p className="text-center text-xs text-slate-500">
              {videoFrames.length} frames will each get exit and shelter labels,
              plus a top-down floor plan.
            </p>

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

      {progress ? <SetupProgressPanel progress={progress} /> : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-20 mx-auto w-full max-w-md border-t border-slate-800 bg-slate-950/90 px-5 py-4 backdrop-blur">
        <button
          onClick={runSetup}
          disabled={
            rescanRoomMissing ||
            !hasCapture ||
            !trimmedLabel ||
            labelTaken ||
            loading ||
            videoExtracting
          }
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-4 text-base font-bold text-slate-950 shadow-neon transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {isPhoto
                ? "Mapping room (all scenarios)…"
                : "Building floor plan & labeling frames…"}
            </>
          ) : (
            <>
              <ScanLine className="h-5 w-5" />
              {rescanId ? "Update room & rebuild plans" : "Save room & build plans"}
            </>
          )}
        </button>
        {!hasCapture || !trimmedLabel || labelTaken ? (
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-slate-500">
            <ImageUp className="h-3.5 w-3.5" />
            Add a room name and capture media to continue
          </p>
        ) : null}
      </div>
    </main>
  );
}
