"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  DoorOpen,
  ListChecks,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import ImageOverlay from "@/components/ImageOverlay";
import RoomModelView from "@/components/RoomModelView";
import { getScenario } from "@/lib/scenarios";
import { loadScan, type StoredScan } from "@/lib/scanStore";
import type { AccessibilityStatus, EffectivenessRating } from "@/lib/types";

export default function ResultsPage() {
  const router = useRouter();
  const [scan, setScan] = useState<StoredScan | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setScan(loadScan());
    setReady(true);
  }, []);

  if (ready && !scan) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <ScanLine className="h-10 w-10 text-emerald-400" />
        <h1 className="text-lg font-semibold">No scan found</h1>
        <p className="text-sm text-slate-400">
          Run a spatial analysis first to see escape routes and safe zones.
        </p>
        <Link
          href="/scan"
          className="rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 shadow-neon"
        >
          Start a scan
        </Link>
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-emerald-400" />
      </main>
    );
  }

  const cfg = getScenario(scan.scenario);
  const Icon = cfg.icon;
  const { result } = scan;

  const counts = {
    egress: result.egress_points.length,
    safe: result.safe_zones.length,
    hazard: result.hazards.length,
  };

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      {/* Header */}
      <header className="mb-4 flex items-center gap-3">
        <Link
          href="/scan"
          className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white"
          aria-label="Back to scan"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold tracking-tight">Spatial plan</h1>
          <div
            className={`mt-0.5 inline-flex items-center gap-1.5 text-sm ${cfg.accent.text}`}
          >
            <Icon className="h-4 w-4" />
            <span className="font-semibold">{cfg.label} scenario</span>
          </div>
        </div>
        {scan.result.saved.success ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> Saved
          </span>
        ) : null}
      </header>

      {/* Spatial view */}
      <section className="mb-4 space-y-4">
        {result.room_model ? (
          <RoomModelView model={result.room_model} />
        ) : null}

        {scan.panorama ? (
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              360° panorama strip
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scan.panorama}
              alt="Stitched 360° room panorama"
              className="max-h-40 w-full object-cover object-center"
            />
          </div>
        ) : null}

        <ImageOverlay
          imageSrc={scan.image}
          result={result}
          maxHeightClass="max-h-[50vh]"
        />
      </section>

      {/* Legend / counts */}
      <section className="mb-6 grid grid-cols-3 gap-2">
        <LegendCard
          icon={<DoorOpen className="h-4 w-4" />}
          label="Exits"
          count={counts.egress}
          color="text-blue-400"
          ring="border-blue-500/30 bg-blue-500/10"
        />
        <LegendCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Safe zones"
          count={counts.safe}
          color="text-emerald-400"
          ring="border-emerald-500/30 bg-emerald-500/10"
        />
        <LegendCard
          icon={<TriangleAlert className="h-4 w-4" />}
          label="Hazards"
          count={counts.hazard}
          color="text-red-400"
          ring="border-red-500/30 bg-red-500/10"
        />
      </section>

      {/* Detected regions */}
      <section className="mb-6 space-y-4">
        {result.egress_points.length > 0 ? (
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-400">
              <DoorOpen className="h-4 w-4" /> Exits
            </h2>
            <ul className="space-y-2">
              {result.egress_points.map((e, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-slate-200">{e.type}</span>
                  <StatusBadge status={e.accessibility_status} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {result.safe_zones.length > 0 ? (
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
              <ShieldCheck className="h-4 w-4" /> Safe zones
            </h2>
            <ul className="space-y-2">
              {result.safe_zones.map((s, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-200">{s.type}</span>
                    <RatingBadge rating={s.effectiveness_rating} />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{s.description}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {result.hazards.length > 0 ? (
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-red-400">
              <TriangleAlert className="h-4 w-4" /> Hazards
            </h2>
            <ul className="space-y-2">
              {result.hazards.map((h, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm"
                >
                  <span className="font-medium text-slate-200">
                    {h.description}
                  </span>
                  <p className="mt-1 text-xs text-slate-400">{h.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* Instructions */}
      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          <ListChecks className="h-4 w-4" /> Action plan
        </h2>
        <ol className="space-y-2">
          {result.actionable_instructions.map((step, i) => (
            <li
              key={i}
              className="flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/50 p-4"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-slate-200">{step}</p>
            </li>
          ))}
          {result.actionable_instructions.length === 0 ? (
            <li className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
              No instructions were returned for this scan.
            </li>
          ) : null}
        </ol>
      </section>

      <Link
        href="/scan"
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 py-4 font-semibold text-slate-200 transition hover:text-white"
      >
        <ScanLine className="h-5 w-5" />
        Scan another space
      </Link>
    </main>
  );
}

function StatusBadge({ status }: { status: AccessibilityStatus }) {
  const styles: Record<AccessibilityStatus, string> = {
    Clear: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    "Partially Blocked": "border-amber-500/30 bg-amber-500/10 text-amber-300",
    Blocked: "border-red-500/30 bg-red-500/10 text-red-300",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function RatingBadge({ rating }: { rating: EffectivenessRating }) {
  const styles: Record<EffectivenessRating, string> = {
    High: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    Medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    Low: "border-slate-600/40 bg-slate-700/20 text-slate-300",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[rating]}`}
    >
      {rating} cover
    </span>
  );
}

function LegendCard({
  icon,
  label,
  count,
  color,
  ring,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  color: string;
  ring: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${ring}`}>
      <div className={`flex items-center gap-1.5 ${color}`}>
        {icon}
        <span className="text-lg font-bold">{count}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  );
}
