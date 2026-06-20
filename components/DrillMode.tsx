"use client";

import { useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2 } from "lucide-react";
import { SCENARIOS } from "@/lib/scenarios";
import { formatLastDrill, getLastDrillAt, recordDrill } from "@/lib/drillStorage";
import type { SavedRoom, Scenario } from "@/lib/types";

interface DrillModeProps {
  room: SavedRoom;
}

export default function DrillMode({ room }: DrillModeProps) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("FIRE");
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [lastDrill, setLastDrill] = useState<number | null>(() =>
    getLastDrillAt(room.id),
  );

  const plan = room.plans[scenario];
  const steps = plan?.actionable_instructions ?? [];
  const allChecked =
    steps.length > 0 && steps.every((_, i) => checked[i]);
  const elapsedSec =
    startedAt != null ? Math.floor((Date.now() - startedAt) / 1000) : 0;

  function startDrill() {
    setOpen(true);
    setChecked({});
    setStartedAt(Date.now());
  }

  function completeDrill() {
    recordDrill(room.id);
    setLastDrill(Date.now());
    setOpen(false);
    setChecked({});
    setStartedAt(null);
  }

  const lastDrillLabel = formatLastDrill(lastDrill);

  if (!open) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Practice drill
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Walk through your emergency steps before you need them.
            </p>
            {lastDrillLabel ? (
              <p className="mt-2 text-xs text-emerald-400/80">{lastDrillLabel}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={startDrill}
            className="shrink-0 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 ring-1 ring-emerald-500/30"
          >
            Run drill
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-slate-950/80 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            Drill in progress
          </p>
          <p className="text-sm text-slate-400">
            {elapsedSec}s · {room.label}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setScenario(s.id);
              setChecked({});
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              scenario === s.id
                ? `${s.accent.bg} ${s.accent.text} ring-1 ${s.accent.border}`
                : "border border-slate-800 text-slate-400"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {steps.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
          No steps saved for this scenario. Re-scan the room to rebuild plans.
        </p>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, i) => {
            const done = Boolean(checked[i]);
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() =>
                    setChecked((prev) => ({ ...prev, [i]: !prev[i] }))
                  }
                  className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                    done
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-slate-800 bg-slate-900/50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      done
                        ? "border-emerald-400 bg-emerald-500 text-slate-950"
                        : "border-slate-600"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className={done ? "text-slate-400 line-through" : "text-slate-200"}>
                    {step}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <button
        type="button"
        disabled={!allChecked}
        onClick={completeDrill}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
      >
        {allChecked ? (
          <>
            <ClipboardCheck className="h-4 w-4" />
            Complete drill
          </>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            Check all steps to finish
          </>
        )}
      </button>
    </div>
  );
}
