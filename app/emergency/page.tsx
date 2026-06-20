"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  DoorOpen,
  ListChecks,
  Loader2,
  MapPin,
  ShieldAlert,
} from "lucide-react";
import CachedRoomImage from "@/components/CachedRoomImage";
import EmergencyCallButton from "@/components/EmergencyCallButton";
import ImageOverlay from "@/components/ImageOverlay";
import PlanRegionLists from "@/components/PlanRegionLists";
import PrintPlanButton from "@/components/PrintPlanButton";
import RoomModelView from "@/components/RoomModelView";
import { imageOverlayCaption } from "@/lib/exitPath";
import { GENERAL_EMERGENCY_STEPS } from "@/lib/generalEmergencyGuidance";
import { resolveRoomImages } from "@/lib/imageCache";
import { isPlanEmpty } from "@/lib/planCounts";
import { listRooms } from "@/lib/roomLibrary";
import { SCENARIOS, getScenario } from "@/lib/scenarios";
import type { AnalysisResult, SavedRoom, Scenario } from "@/lib/types";

type Step = "room" | "scenario" | "plan" | "general";

export default function EmergencyPage() {
  return (
    <Suspense
      fallback={
        <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-red-400" />
        </main>
      }
    >
      <EmergencyPageContent />
    </Suspense>
  );
}

function EmergencyPageContent() {
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room")?.trim() || null;
  const scenarioParam = searchParams.get("scenario")?.trim() as Scenario | null;

  const [step, setStep] = useState<Step>("room");
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<SavedRoom | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [resolvedImages, setResolvedImages] = useState<string[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [deeplinkHandled, setDeeplinkHandled] = useState(false);

  useEffect(() => {
    void listRooms()
      .then(setRooms)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (deeplinkHandled || loading) return;
    if (!roomParam) return;

    const match = rooms.find((r) => r.id === roomParam);
    if (!match) return;

    setRoom(match);
    if (
      scenarioParam &&
      SCENARIOS.some((s) => s.id === scenarioParam)
    ) {
      setScenario(scenarioParam);
      setStep("plan");
    } else {
      setStep("scenario");
    }
    setDeeplinkHandled(true);
  }, [roomParam, scenarioParam, rooms, loading, deeplinkHandled]);

  useEffect(() => {
    if (!room) {
      setResolvedImages([]);
      return;
    }
    let active = true;
    void resolveRoomImages(room).then((urls) => {
      if (active) {
        setResolvedImages(urls.filter(Boolean));
        setFrameIndex(0);
      }
    });
    return () => {
      active = false;
    };
  }, [room]);

  const plan: AnalysisResult | null =
    room && scenario ? room.plans[scenario] : null;
  const cfg = scenario ? getScenario(scenario) : null;
  const planIsEmpty = isPlanEmpty(plan);

  const framePlan = useMemo(() => {
    if (!room?.framePlans?.length || frameIndex >= room.framePlans.length) {
      return null;
    }
    return room.framePlans[frameIndex]?.[scenario ?? "FIRE"] ?? null;
  }, [room, frameIndex, scenario]);

  const displayPlan = framePlan ?? plan;
  const displayImage =
    resolvedImages[frameIndex] ?? resolvedImages[0] ?? room?.image ?? "";
  const hasMultipleFrames =
    (room?.frameImages?.length ?? resolvedImages.length) > 1;

  if (step === "general") {
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6 pb-10">
        <header className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStep("room")}
            className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-red-400">
              General guidance
            </h1>
            <p className="text-sm text-slate-400">
              You&apos;re not in a saved room
            </p>
          </div>
        </header>

        <EmergencyCallButton className="mb-6" />

        <section>
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <ListChecks className="h-4 w-4" /> What to do now
          </h2>
          <ol className="space-y-2">
            {GENERAL_EMERGENCY_STEPS.map((stepText, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-slate-200">
                  {stepText}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    );
  }

  if (step === "plan" && room && scenario && displayPlan && cfg) {
    const Icon = cfg.icon;
    return (
      <main className="print-plan-root bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6 pb-10">
        <header className="mb-4 flex items-center gap-3 print:hidden">
          <button
            type="button"
            onClick={() => setStep("scenario")}
            className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold tracking-tight text-red-400">
              Emergency plan
            </h1>
            <p className="text-sm text-slate-400">
              {room.label} ·{" "}
              <span className={`inline-flex items-center gap-1 ${cfg.accent.text}`}>
                <Icon className="h-3.5 w-3.5" />
                {cfg.label}
              </span>
            </p>
          </div>
          <PrintPlanButton />
        </header>

        <div className="hidden print:block print:mb-4">
          <h1 className="text-2xl font-bold text-black">
            {room.label} — {cfg.label} plan
          </h1>
          <p className="text-sm text-gray-600">
            SafeSpace emergency card · {new Date(room.createdAt).toLocaleDateString()}
          </p>
        </div>

        <EmergencyCallButton className="mb-4 print:hidden" />

        <p className="mb-4 rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-2 text-xs text-slate-400 print:hidden">
          Plans saved on this device · Last scanned{" "}
          {new Date(room.createdAt).toLocaleDateString()}
        </p>

        {planIsEmpty ? (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <p className="font-semibold">No saved plan for this scenario</p>
            <p className="mt-1 text-amber-100/80">
              Follow the general steps below. Re-scan this room when safe.
            </p>
          </div>
        ) : null}

        <section className="mb-4 space-y-4">
          {displayPlan.room_model ? (
            <RoomModelView model={displayPlan.room_model} scenario={scenario} />
          ) : null}
          {room.panorama ? (
            <div className="overflow-hidden rounded-2xl border border-slate-800 print:hidden">
              <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Room view
              </p>
              <CachedRoomImage
                roomId={room.id}
                src={room.panorama}
                alt={`Panorama of ${room.label}`}
                className="max-h-36 w-full object-cover"
              />
            </div>
          ) : null}

          {displayImage && !planIsEmpty ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80">
              <div className="border-b border-slate-800 px-4 py-2">
                <p className="text-xs text-slate-400">
                  {imageOverlayCaption(displayPlan, scenario)}
                </p>
                {hasMultipleFrames ? (
                  <div className="mt-2 flex flex-wrap gap-2 print:hidden">
                    {resolvedImages.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setFrameIndex(i)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          frameIndex === i
                            ? "bg-blue-500 text-white"
                            : "border border-slate-700 text-slate-400"
                        }`}
                      >
                        View {i + 1}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="p-3">
                <ImageOverlay
                  imageSrc={displayImage}
                  cacheRoomId={room.id}
                  cacheIndex={frameIndex}
                  result={displayPlan}
                  scenario={scenario}
                  maxHeightClass="max-h-[45vh]"
                />
              </div>
            </div>
          ) : null}
        </section>

        {!planIsEmpty ? (
          <PlanRegionLists result={displayPlan} className="mb-6" />
        ) : null}

        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <ListChecks className="h-4 w-4" /> What to do now
          </h2>
          <ol className="space-y-2">
            {(planIsEmpty
              ? GENERAL_EMERGENCY_STEPS
              : Array.isArray(displayPlan.actionable_instructions)
                ? displayPlan.actionable_instructions
                : []
            ).map((stepText, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <p className="text-sm leading-relaxed text-slate-200">{stepText}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    );
  }

  if (step === "scenario" && room) {
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6 pb-10">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setRoom(null);
              setStep("room");
            }}
            className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-red-400">
              What&apos;s happening?
            </h1>
            <p className="text-sm text-slate-400">You are in: {room.label}</p>
          </div>
        </header>

        <EmergencyCallButton className="mb-6" />

        <div className="grid gap-3">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setScenario(s.id);
                  setStep("plan");
                }}
                className={`flex items-center gap-4 rounded-2xl border p-4 text-left transition hover:border-slate-600 ${s.accent.bg} ${s.accent.border}`}
              >
                <Icon className={`h-8 w-8 shrink-0 ${s.accent.text}`} />
                <div>
                  <p className="font-bold text-white">{s.label}</p>
                  <p className="text-sm text-slate-400">{s.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    );
  }

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6 pb-10">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-red-400">
          Emergency
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Which room are you in right now?
        </p>
      </header>

      <EmergencyCallButton className="mb-6" />

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-red-400" />
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-1 flex-col gap-6 pb-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-center">
            <MapPin className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">
              No saved rooms yet — set up labeled scans for room-specific exit
              routes and shelter spots.
            </p>
            <Link
              href="/scan"
              className="mt-4 inline-flex rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950"
            >
              Set up rooms
            </Link>
          </div>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <ListChecks className="h-4 w-4" />
              What to do now
            </h2>
            <ol className="space-y-2">
              {GENERAL_EMERGENCY_STEPS.map((stepText, i) => (
                <li
                  key={i}
                  className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-slate-200">
                    {stepText}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : (
        <>
          <ul className="space-y-2 pb-4">
            {rooms.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    setRoom(r);
                    setStep("scenario");
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-left transition hover:border-red-500/40 hover:bg-red-500/5"
                >
                  {r.image ? (
                    <CachedRoomImage
                      roomId={r.id}
                      src={r.image}
                      alt={`Photo of ${r.label}`}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <DoorOpen className="h-12 w-12 p-3 text-slate-500" />
                  )}
                  <span className="font-semibold text-slate-100">{r.label}</span>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={() => setStep("general")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/40 py-3 text-sm font-medium text-slate-400 transition hover:text-slate-200"
          >
            <ShieldAlert className="h-4 w-4" />
            I&apos;m not in a saved room
          </button>
        </>
      )}
    </main>
  );
}
