"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ListChecks, Loader2 } from "lucide-react";
import ImageOverlay from "@/components/ImageOverlay";
import RoomModelView from "@/components/RoomModelView";
import { listRooms } from "@/lib/roomLibrary";
import { SCENARIOS, getScenario } from "@/lib/scenarios";
import type { SavedRoom, Scenario } from "@/lib/types";

export default function RoomDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [room, setRoom] = useState<SavedRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario>("FIRE");

  useEffect(() => {
    void listRooms()
      .then((rooms) => setRoom(rooms.find((r) => r.id === id) ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  const plan = room?.plans[scenario] ?? null;
  const cfg = getScenario(scenario);

  if (loading) {
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </main>
    );
  }

  if (!room || !plan) {
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6">
        <Link
          href="/rooms"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to saved rooms
        </Link>
        <p className="text-slate-400">Room not found.</p>
      </main>
    );
  }

  const Icon = cfg.icon;

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6 pb-24">
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/rooms"
          className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white"
          aria-label="Back to saved rooms"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">
            {room.label}
          </h1>
          <p className="text-sm text-slate-400">
            Tap labels on the map ·{" "}
            <span className={`inline-flex items-center gap-1 ${cfg.accent.text}`}>
              <Icon className="h-3.5 w-3.5" />
              {cfg.label}
            </span>
          </p>
        </div>
      </header>

      <div className="mb-4 flex gap-2">
        {SCENARIOS.map((s) => {
          const SIcon = s.icon;
          const active = scenario === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenario(s.id)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[10px] font-semibold transition ${
                active
                  ? `${s.accent.bg} ${s.accent.border} ${s.accent.text}`
                  : "border-slate-800 bg-slate-900/50 text-slate-500 hover:border-slate-700"
              }`}
            >
              <SIcon className="h-4 w-4" />
              {s.label}
            </button>
          );
        })}
      </div>

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
          maxHeightClass="max-h-[50vh]"
        />
      </section>

      <section className="mb-6 grid grid-cols-3 gap-2">
        <Stat label="Exits" count={plan.egress_points.length} color="text-blue-400" />
        <Stat label="Safe" count={plan.safe_zones.length} color="text-emerald-400" />
        <Stat label="Hazards" count={plan.hazards.length} color="text-red-400" />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <ListChecks className="h-4 w-4" /> Plan for {cfg.label.toLowerCase()}
        </h2>
        <ol className="space-y-2">
          {plan.actionable_instructions.map((stepText, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">
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
