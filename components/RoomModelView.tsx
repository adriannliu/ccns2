"use client";

import { useMemo, useState } from "react";
import type { LandmarkType, Point2D, RoomModel, Scenario } from "@/lib/types";

interface RoomModelViewProps {
  model: RoomModel;
  /** When set, tailors path/labels for the active emergency. */
  scenario?: Scenario;
  className?: string;
}

const LANDMARK_STYLES: Record<
  LandmarkType,
  { fill: string; stroke: string; text: string }
> = {
  exit: { fill: "rgb(59 130 246)", stroke: "rgb(147 197 253)", text: "EXIT" },
  door: { fill: "rgb(59 130 246)", stroke: "rgb(147 197 253)", text: "DOOR" },
  window: {
    fill: "rgb(96 165 250)",
    stroke: "rgb(191 219 254)",
    text: "WIN",
  },
  hazard: { fill: "rgb(239 68 68)", stroke: "rgb(252 165 165)", text: "!" },
  safe_zone: {
    fill: "rgb(16 185 129)",
    stroke: "rgb(110 231 183)",
    text: "SAFE",
  },
  furniture: {
    fill: "rgb(100 116 139)",
    stroke: "rgb(148 163 184)",
    text: "",
  },
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function pt([x, y]: Point2D): { x: number; y: number } {
  return { x: clamp01(x), y: clamp01(y) };
}

function pathD(points: Point2D[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points.map(pt);
  return (
    `M ${first.x} ${first.y}` +
    rest.map((p) => ` L ${p.x} ${p.y}`).join("")
  );
}

export default function RoomModelView({
  model,
  scenario,
  className = "",
}: RoomModelViewProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const showExitPath =
    !scenario || scenario === "FIRE" || scenario === "CODE_RED";

  const exitPath = useMemo(() => {
    if (!showExitPath) return [];
    return model.exit_path.filter((p) => p.length === 2);
  }, [model.exit_path, showExitPath]);

  const subtitle =
    scenario === "FIRE"
      ? "Follow the dotted line to the nearest exit."
      : scenario === "EARTHQUAKE"
        ? "Head to marked cover zones — do not use exit paths while shaking."
        : scenario === "CODE_RED"
          ? "Move to concealment along the dotted path."
          : "Stitched from your 360° scan — follow the dotted line to the exit.";
  const origin = useMemo(() => pt(model.scan_origin), [model.scan_origin]);

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 ${className}`}
    >
      <div className="border-b border-slate-800 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Room model · top-down
        </p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>

      <svg
        viewBox="0 0 1 1"
        className="aspect-square w-full bg-slate-900/60"
        role="img"
        aria-label="Top-down room model with exit path and labeled landmarks"
      >
        {/* Floor grid */}
        <defs>
          <pattern
            id="floor-grid"
            width="0.1"
            height="0.1"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 0.1 0 L 0 0 0 0.1"
              fill="none"
              stroke="rgb(51 65 85)"
              strokeWidth="0.002"
            />
          </pattern>
        </defs>
        <rect width="1" height="1" fill="url(#floor-grid)" />

        {/* Walls */}
        {model.walls.map((wall, i) => {
          if (wall.length < 2) return null;
          const [a, b] = wall.map(pt);
          return (
            <line
              key={`wall-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="rgb(226 232 240)"
              strokeWidth={0.012}
              strokeLinecap="round"
            />
          );
        })}

        {/* Exit path — dotted polyline */}
        {exitPath.length >= 2 ? (
          <>
            <path
              d={pathD(exitPath)}
              fill="none"
              stroke="rgb(96 165 250)"
              strokeWidth={0.014}
              strokeDasharray="0.04 0.028"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.95}
            />
            {(() => {
              const end = pt(exitPath[exitPath.length - 1]);
              return (
                <polygon
                  points={`${end.x},${end.y - 0.02} ${end.x + 0.022},${end.y} ${end.x},${end.y + 0.02}`}
                  fill="rgb(96 165 250)"
                />
              );
            })()}
          </>
        ) : null}

        {/* Scan origin (you are here) */}
        <circle
          cx={origin.x}
          cy={origin.y}
          r={0.022}
          fill="rgb(15 23 42)"
          stroke="rgb(96 165 250)"
          strokeWidth={0.006}
        />
        <circle cx={origin.x} cy={origin.y} r={0.008} fill="rgb(96 165 250)" />
        <text
          x={origin.x}
          y={Math.min(0.97, origin.y + 0.055)}
          textAnchor="middle"
          fill="rgb(148 163 184)"
          fontSize={0.028}
          fontWeight={600}
        >
          You
        </text>

        {/* Landmarks */}
        {model.landmarks.map((lm, i) => {
          const pos = pt(lm.position);
          const style = LANDMARK_STYLES[lm.type] ?? LANDMARK_STYLES.furniture;
          const isActive = activeIndex === i;
          const labelY = pos.y < 0.14 ? pos.y + 0.055 : pos.y - 0.038;

          return (
            <g
              key={`lm-${i}`}
              className="cursor-pointer"
              onClick={() => setActiveIndex(isActive ? null : i)}
            >
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isActive ? 0.032 : 0.026}
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={0.005}
                opacity={0.92}
              />
              <text
                x={pos.x}
                y={labelY}
                textAnchor="middle"
                fill="rgb(248 250 252)"
                fontSize={isActive ? 0.032 : 0.028}
                fontWeight={700}
              >
                {lm.label}
              </text>
              {isActive && lm.detail ? (
                <text
                  x={pos.x}
                  y={labelY + (pos.y < 0.14 ? 0.038 : -0.038)}
                  textAnchor="middle"
                  fill="rgb(148 163 184)"
                  fontSize={0.024}
                >
                  {lm.detail}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
