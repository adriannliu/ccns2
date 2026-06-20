"use client";

import Link from "next/link";
import { CheckCircle2, DoorOpen, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import type { SavedRoom } from "@/lib/types";
import { countRoomLabels } from "@/lib/planCounts";

interface SetupSuccessScreenProps {
  room: SavedRoom;
  rescanId: string | null;
  onAddAnother: () => void;
}

export default function SetupSuccessScreen({
  room,
  rescanId,
  onAddAnother,
}: SetupSuccessScreenProps) {
  const counts = countRoomLabels(room);
  const viewHref = rescanId ? `/rooms/${rescanId}` : `/rooms/${room.id}`;

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-10">
      <div className="w-full rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-emerald-400" />
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Room mapped
        </h1>
        <p className="mt-2 text-sm text-emerald-100/90">
          <span className="font-semibold">{room.label}</span> is ready for all
          three emergency scenarios.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <CountChip
            icon={<DoorOpen className="h-4 w-4 text-blue-400" />}
            label="Exits"
            count={counts.exits}
          />
          <CountChip
            icon={<ShieldCheck className="h-4 w-4 text-emerald-400" />}
            label="Safe"
            count={counts.safeZones}
          />
          <CountChip
            icon={<TriangleAlert className="h-4 w-4 text-red-400" />}
            label="Hazards"
            count={counts.hazards}
          />
        </div>

        <p className="mt-4 text-xs text-slate-400">
          Plans are saved on this device. In an emergency, open the Emergency
          tab for instant access — no AI wait. Add SafeSpace to your home screen
          for quick access.
        </p>
      </div>

      <div className="mt-6 w-full space-y-3">
        <Link
          href={viewHref}
          className="flex w-full items-center justify-center rounded-2xl bg-emerald-500 py-4 text-base font-bold text-slate-950 shadow-neon"
        >
          View room
        </Link>
        {!rescanId ? (
          <button
            type="button"
            onClick={onAddAnother}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 py-4 text-base font-semibold text-slate-200"
          >
            <Plus className="h-5 w-5" />
            Add another room
          </button>
        ) : (
          <Link
            href="/rooms"
            className="flex w-full items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 py-4 text-base font-semibold text-slate-200"
          >
            Back to saved rooms
          </Link>
        )}
      </div>
    </main>
  );
}

function CountChip({
  icon,
  label,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-center justify-center gap-1">{icon}</div>
      <p className="mt-1 text-lg font-bold text-white">{count}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </p>
    </div>
  );
}
