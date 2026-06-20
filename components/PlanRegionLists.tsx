"use client";

import { DoorOpen, ShieldCheck, TriangleAlert } from "lucide-react";
import type {
  AccessibilityStatus,
  AnalysisResult,
  EffectivenessRating,
} from "@/lib/types";

interface PlanRegionListsProps {
  result: AnalysisResult;
  className?: string;
}

export function OverlayLegend({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${className}`}
      aria-label="Overlay legend"
    >
      <LegendChip color="bg-blue-400" label="Exit" />
      <LegendChip color="bg-emerald-400" label="Safe zone" />
      <LegendChip color="bg-red-400" label="Hazard" />
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-300">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export default function PlanRegionLists({
  result,
  className = "",
}: PlanRegionListsProps) {
  return (
    <section className={`space-y-4 ${className}`}>
      <OverlayLegend />

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
