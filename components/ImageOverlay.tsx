"use client";

import { useMemo, useState } from "react";
import type {
  AnalysisResult,
  BBox,
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

/** Clamp a number into the [0, 1] range. */
function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Convert a normalized [ymin, xmin, ymax, xmax] box into CSS percentage
 * positioning. Defensive against swapped/out-of-range coordinates.
 *
 * Because the box is positioned in % relative to a wrapper that is sized
 * exactly to the rendered image (see render below), these percentages map
 * 1:1 onto the visible pixels regardless of the device viewport.
 */
function boxToStyle([ymin, xmin, ymax, xmax]: BBox): React.CSSProperties {
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
  ];
}

export default function ImageOverlay({
  imageSrc,
  result,
  maxHeightClass = "max-h-[70vh]",
  className = "",
}: ImageOverlayProps) {
  const regions = useMemo(() => flatten(result), [result]);
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
