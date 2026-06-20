"use client";

import { useMemo, useState } from "react";
import type {
  AccessibilityStatus,
  AnalysisResult,
  BBox,
  EgressPoint,
  EgressType,
  OverlayRegion,
  RegionKind,
} from "@/lib/types";

interface ImageOverlayProps {
  imageSrc: string;
  result: AnalysisResult;
  /** Max height (in viewport-aware CSS) the image is allowed to occupy. */
  maxHeightClass?: string;
  className?: string;
}

/**
 * Per-kind visual styling for the bounding boxes.
 * - egress  -> blue
 * - hazard  -> red
 * - safe_zone -> green
 */
const KIND_STYLES: Record<
  RegionKind,
  { box: string; chip: string; dot: string; label: string }
> = {
  egress: {
    box: "border-blue-400 bg-blue-500/20",
    chip: "bg-blue-500 text-white",
    dot: "bg-blue-400",
    label: "EXIT",
  },
  hazard: {
    box: "border-red-500 bg-red-500/25",
    chip: "bg-red-500 text-white",
    dot: "bg-red-400",
    label: "HAZARD",
  },
  safe_zone: {
    box: "border-emerald-400 bg-emerald-500/20",
    chip: "bg-emerald-500 text-slate-950",
    dot: "bg-emerald-400",
    label: "SAFE",
  },
};

/** Assumed camera/user position when holding the phone facing into the room. */
const USER_POSITION = { x: 0.5, y: 0.92 } as const;

const ACCESSIBILITY_RANK: Record<AccessibilityStatus, number> = {
  Clear: 0,
  "Partially Blocked": 1,
  Blocked: 2,
};

const EGRESS_TYPE_RANK: Record<EgressType, number> = {
  "Primary Door": 0,
  "Secondary Door": 1,
  Window: 2,
};

/** Clamp a number into the [0, 1] range. */
function clamp01(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Coerce whatever the VLM returned into a valid [ymin, xmin, ymax, xmax] tuple.
 * The model occasionally emits malformed coordinates (missing, wrong length,
 * or non-array), which previously crashed destructuring with "param is not
 * iterable". Returns null when the box can't be salvaged.
 */
function normalizeBBox(coordinates: unknown): BBox | null {
  if (!Array.isArray(coordinates) || coordinates.length < 4) return null;
  const nums = coordinates
    .slice(0, 4)
    .map((v) => (typeof v === "number" ? v : Number(v)));
  if (nums.some((n) => Number.isNaN(n))) return null;
  return nums as BBox;
}

function bboxCenter(coordinates: BBox): { x: number; y: number } {
  const box = normalizeBBox(coordinates);
  if (!box) return { x: 0.5, y: 0.5 };
  const [ymin, xmin, ymax, xmax] = box;
  return {
    x: (clamp01(xmin) + clamp01(xmax)) / 2,
    y: (clamp01(ymin) + clamp01(ymax)) / 2,
  };
}

function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Pick the best egress: prefer clear primary doors, then nearest by distance. */
function pickRecommendedEgress(egress: EgressPoint[]): EgressPoint | null {
  const valid = egress.filter((e) => normalizeBBox(e.coordinates) !== null);
  if (valid.length === 0) return null;

  const reachable = valid.filter((e) => e.accessibility_status !== "Blocked");
  const candidates = reachable.length > 0 ? reachable : valid;

  return [...candidates].sort((a, b) => {
    const byAccess =
      ACCESSIBILITY_RANK[a.accessibility_status] -
      ACCESSIBILITY_RANK[b.accessibility_status];
    if (byAccess !== 0) return byAccess;

    const byType = EGRESS_TYPE_RANK[a.type] - EGRESS_TYPE_RANK[b.type];
    if (byType !== 0) return byType;

    return (
      dist(USER_POSITION, bboxCenter(a.coordinates)) -
      dist(USER_POSITION, bboxCenter(b.coordinates))
    );
  })[0];
}

/**
 * Convert a normalized [ymin, xmin, ymax, xmax] box into CSS percentage
 * positioning. Defensive against swapped/out-of-range coordinates.
 *
 * Because the box is positioned in % relative to a wrapper that is sized
 * exactly to the rendered image (see render below), these percentages map
 * 1:1 onto the visible pixels regardless of the device viewport.
 */
function boxToStyle(coordinates: BBox): React.CSSProperties {
  const box = normalizeBBox(coordinates) ?? [0, 0, 0, 0];
  const [ymin, xmin, ymax, xmax] = box;
  const top = clamp01(Math.min(ymin, ymax));
  const left = clamp01(Math.min(xmin, xmax));
  const bottom = clamp01(Math.max(ymin, ymax));
  const right = clamp01(Math.max(xmin, xmax));

  return {
    top: `${top * 100}%`,
    left: `${left * 100}%`,
    width: `${(right - left) * 100}%`,
    height: `${(bottom - top) * 100}%`,
  };
}

function flatten(result: AnalysisResult): OverlayRegion[] {
  return [
    ...(result.egress_points ?? []).map<OverlayRegion>((r) => ({
      kind: "egress",
      coordinates: r.coordinates,
      label: r.type,
      detail: r.accessibility_status,
    })),
    ...(result.safe_zones ?? []).map<OverlayRegion>((r) => ({
      kind: "safe_zone",
      coordinates: r.coordinates,
      label: r.type,
      detail: r.effectiveness_rating,
    })),
    ...(result.hazards ?? []).map<OverlayRegion>((r) => ({
      kind: "hazard",
      coordinates: r.coordinates,
      label: r.description,
      detail: r.reason,
    })),
  ].filter((region) => normalizeBBox(region.coordinates) !== null);
}

export default function ImageOverlay({
  imageSrc,
  result,
  maxHeightClass = "max-h-[70vh]",
  className = "",
}: ImageOverlayProps) {
  const regions = useMemo(() => flatten(result), [result]);
  const recommendedExit = useMemo(
    () => pickRecommendedEgress(result.egress_points ?? []),
    [result.egress_points],
  );
  const exitTarget = useMemo(
    () =>
      recommendedExit ? bboxCenter(recommendedExit.coordinates) : null,
    [recommendedExit],
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div className={`flex w-full justify-center ${className}`}>
      {/*
        The wrapper is `inline-block` and shrinks to the *rendered* size of the
        image (the <img> uses max-w / max-h with auto sizing). This guarantees
        the overlay coordinate space equals the visible image, so object-contain
        style letterboxing can never misalign the boxes.
      */}
      <div className="relative inline-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="Scanned room"
          className={`block h-auto w-auto max-w-full rounded-xl ${maxHeightClass} object-contain`}
        />

        {/* Recommended path to nearest viable exit */}
        {exitTarget ? (
          <svg
            className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden
          >
            <defs>
              <marker
                id="exit-path-arrow"
                markerWidth="0.05"
                markerHeight="0.05"
                refX="0.04"
                refY="0.025"
                orient="auto"
              >
                <path
                  d="M0,0 L0.05,0.025 L0,0.05 Z"
                  fill="rgb(96 165 250)"
                />
              </marker>
            </defs>
            <line
              x1={USER_POSITION.x}
              y1={USER_POSITION.y}
              x2={exitTarget.x}
              y2={exitTarget.y}
              stroke="rgb(96 165 250)"
              strokeWidth={0.008}
              strokeDasharray="0.028 0.02"
              strokeLinecap="round"
              markerEnd="url(#exit-path-arrow)"
              opacity={0.95}
            />
            <circle
              cx={USER_POSITION.x}
              cy={USER_POSITION.y}
              r={0.016}
              fill="rgb(15 23 42)"
              stroke="rgb(96 165 250)"
              strokeWidth={0.005}
            />
            <circle
              cx={USER_POSITION.x}
              cy={USER_POSITION.y}
              r={0.006}
              fill="rgb(96 165 250)"
            />
          </svg>
        ) : null}

        {/* Bounding boxes */}
        {regions.map((region, i) => {
          const style = KIND_STYLES[region.kind];
          const css = boxToStyle(region.coordinates);
          const labelTop = clamp01(region.coordinates[0]) < 0.12;
          const isActive = activeIndex === i;

          return (
            <button
              key={`${region.kind}-${i}`}
              type="button"
              onClick={() => setActiveIndex(isActive ? null : i)}
              style={css}
              className={`absolute rounded-md border-2 ${style.box} ${
                isActive ? "z-20 ring-2 ring-white/70" : "z-10"
              } transition-shadow focus:outline-none`}
              aria-label={`${style.label}: ${region.label}`}
            >
              {/* Label chip */}
              <span
                className={`absolute ${
                  labelTop ? "top-1 left-1" : "bottom-full left-0 mb-1"
                } flex max-w-[60vw] items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-md ${style.chip} ${
                  isActive ? "whitespace-normal" : "truncate whitespace-nowrap"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                <span className="truncate">{region.label}</span>
                {region.detail ? (
                  <span className="font-normal opacity-80">
                    · {region.detail}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
