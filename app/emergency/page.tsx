"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  DoorOpen,
  ListChecks,
  Loader2,
  MapPin,
} from "lucide-react";
import EmergencyCallButton from "@/components/EmergencyCallButton";
import ImageOverlay from "@/components/ImageOverlay";
import RoomModelView from "@/components/RoomModelView";
import { GENERAL_EMERGENCY_STEPS } from "@/lib/generalEmergencyGuidance";
import { listRooms } from "@/lib/roomLibrary";
import { SCENARIOS, getScenario } from "@/lib/scenarios";
import type { AnalysisResult, SavedRoom, Scenario } from "@/lib/types";

type Step = "room" | "scenario" | "plan";

export default function EmergencyPage() {
  const [step, setStep] = useState<Step>("room");
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<SavedRoom | null>(null);
  const [scenario, setScenario] = useState<Scenario | null>(null);

  useEffect(() => {
    void listRooms().then(setRooms).finally(() => setLoading(false));
  }, []);

  const plan: AnalysisResult | null =
    room && scenario ? room.plans[scenario] : null;
  const cfg = scenario ? getScenario(scenario) : null;

  if (step === "plan" && room && scenario && plan && cfg) {
    const Icon = cfg.icon;
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6">
        <header className="mb-4 flex items-center gap-3">
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
        </header>

        <EmergencyCallButton className="mb-4" />

        <section className="mb-4 space-y-4">
          {plan.room_model ? (
            <RoomModelView model={plan.room_model} scenario={scenario} />
          ) : null}
          {room.panorama ? (
            <div className="overflow-hidden rounded-2xl border border-slate-800">
              <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                Room view
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={room.panorama}
                alt=""
                className="max-h-36 w-full object-cover"
              />
            </div>
          ) : null}
          <ImageOverlay
            imageSrc={room.image}
            result={plan}
            scenario={scenario}
            maxHeightClass="max-h-[45vh]"
          />
        </section>

        <section className="mb-6 grid grid-cols-3 gap-2">
          <Stat label="Exits" count={plan.egress_points.length} color="text-blue-400" />
          <Stat label="Safe" count={plan.safe_zones.length} color="text-emerald-400" />
          <Stat label="Hazards" count={plan.hazards.length} color="text-red-400" />
        </section>

        <section className="mb-8">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            <ListChecks className="h-4 w-4" /> What to do now
          </h2>
          <ol className="space-y-2">
            {(Array.isArray(plan.actionable_instructions)
              ? plan.actionable_instructions
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
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6">
        <header className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStep("room")}
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
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6">
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
        <ul className="space-y-2 pb-6">
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
                ) : (
                  <DoorOpen className="h-12 w-12 p-3 text-slate-500" />
                )}
                <span className="font-semibold text-slate-100">{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function Stat({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-3 text-center">
      <p className={`text-lg font-bold ${color}`}>{count}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
