"use client";

import { Loader2 } from "lucide-react";

export interface SetupProgressState {
  message: string;
  step: number;
  totalSteps: number;
  /** 0–100, updated continuously during long operations. */
  percent: number;
}

interface SetupProgressPanelProps {
  progress: SetupProgressState;
}

export default function SetupProgressPanel({
  progress,
}: SetupProgressPanelProps) {
  return (
    <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="flex items-center gap-3">
        <Loader2 className="h-6 w-6 shrink-0 animate-spin text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-100">
            {progress.message}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Step {progress.step} of {progress.totalSteps} ·{" "}
            {Math.round(progress.percent)}%
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Pre-computing all scenarios now so your emergency plan loads instantly
        later.
      </p>
    </div>
  );
}

export function buildSetupSteps(
  isPhoto: boolean,
  mediaCount: number,
): { messages: string[] } {
  const steps: string[] = ["Uploading images…"];

  if (!isPhoto) {
    steps.push("Building top-down floor plan…");
    for (let i = 1; i <= mediaCount; i++) {
      steps.push(`Labeling frame ${i} of ${mediaCount}…`);
    }
  } else if (mediaCount > 1) {
    for (let i = 1; i <= mediaCount; i++) {
      steps.push(`Analyzing photo ${i} of ${mediaCount}…`);
    }
  } else {
    steps.push("Analyzing room photo…");
  }

  steps.push(
    "Building fire plan…",
    "Building earthquake plan…",
    "Building code red plan…",
    "Saving room…",
  );

  return { messages: steps };
}

/** Drives staged copy + a smoothly advancing percent bar. */
export function createSetupProgressDriver(
  messages: string[],
  setProgress: (state: SetupProgressState) => void,
) {
  let stepIndex = 0;
  let percent = 0;
  let creepTimer: ReturnType<typeof setInterval> | null = null;
  let analysisTimer: ReturnType<typeof setInterval> | null = null;

  const totalSteps = messages.length;

  const emit = (message?: string, stepOverride?: number) => {
    const step = stepOverride ?? stepIndex;
    setProgress({
      message: message ?? messages[step] ?? messages[messages.length - 1],
      step: step + 1,
      totalSteps,
      percent: Math.min(100, Math.round(percent * 10) / 10),
    });
  };

  const stopTimers = () => {
    if (creepTimer) clearInterval(creepTimer);
    if (analysisTimer) clearInterval(analysisTimer);
    creepTimer = null;
    analysisTimer = null;
  };

  /** Jump to a step and creep the bar toward the next milestone. */
  const goToStep = (index: number, message?: string) => {
    stopTimers();
    stepIndex = Math.max(0, Math.min(index, totalSteps - 1));
    const floor = (stepIndex / totalSteps) * 100;
    percent = Math.max(percent, floor);
    emit(message);

    const ceiling =
      stepIndex >= totalSteps - 1
        ? 99
        : ((stepIndex + 1) / totalSteps) * 100 - 1;

    creepTimer = setInterval(() => {
      if (percent < ceiling) {
        percent += 0.35;
        emit();
      }
    }, 100);
  };

  /** Interpolate upload progress within the first step (0 → first milestone). */
  const setUploadProgress = (completed: number, total: number) => {
    stopTimers();
    stepIndex = 0;
    const slice = 100 / totalSteps;
    percent = Math.max(percent, (completed / total) * slice);
    emit(
      total <= 1
        ? "Uploading image…"
        : `Uploading image ${completed} of ${total}…`,
      0,
    );

    if (completed < total) {
      const ceiling = ((completed + 1) / total) * slice - 0.5;
      creepTimer = setInterval(() => {
        if (percent < ceiling) {
          percent += 0.4;
          emit();
        }
      }, 100);
    }
  };

  /**
   * Cycle through analysis/scenario steps while the setup API runs,
   * creeping the bar from `fromStep` toward 99%.
   */
  const startAnalysisPhase = (fromStep: number) => {
    stopTimers();
    stepIndex = fromStep;
    const startPercent = (fromStep / totalSteps) * 100;
    percent = Math.max(percent, startPercent);
    emit();

    const endPercent = 99;
    const stepSpan = Math.max(1, totalSteps - fromStep);
    let ticks = 0;

    analysisTimer = setInterval(() => {
      ticks += 1;

      // Advance copy every ~2.5s through remaining steps.
      if (ticks % 25 === 0 && stepIndex < totalSteps - 1) {
        stepIndex += 1;
      }

      const stepProgress = (stepIndex - fromStep + 1) / stepSpan;
      const target = startPercent + stepProgress * (endPercent - startPercent);
      if (percent < target) {
        percent = Math.min(endPercent, percent + 0.25);
      }

      emit();
    }, 100);
  };

  const finish = () => {
    stopTimers();
    stepIndex = totalSteps - 1;
    percent = 100;
    emit();
  };

  const destroy = () => stopTimers();

  goToStep(0);

  return {
    goToStep,
    setUploadProgress,
    startAnalysisPhase,
    finish,
    destroy,
  };
}
