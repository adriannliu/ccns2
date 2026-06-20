import { Flame, Activity, ShieldAlert, type LucideIcon } from "lucide-react";
import type { Scenario } from "./types";

export interface ScenarioConfig {
  id: Scenario;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind accent classes used across the scenario selector / badges. */
  accent: {
    text: string;
    ring: string;
    bg: string;
    border: string;
    glow: string;
  };
}

export const SCENARIOS: ScenarioConfig[] = [
  {
    id: "FIRE",
    label: "Fire",
    description: "Smoke & flames. Find the lowest, fastest exit.",
    icon: Flame,
    accent: {
      text: "text-orange-400",
      ring: "ring-orange-500",
      bg: "bg-orange-500/10",
      border: "border-orange-500",
      glow: "shadow-[0_0_24px_rgba(249,115,22,0.45)]",
    },
  },
  {
    id: "EARTHQUAKE",
    label: "Earthquake",
    description: "Shaking ground. Drop, cover, and hold under cover.",
    icon: Activity,
    accent: {
      text: "text-amber-400",
      ring: "ring-amber-500",
      bg: "bg-amber-500/10",
      border: "border-amber-500",
      glow: "shadow-[0_0_24px_rgba(245,158,11,0.45)]",
    },
  },
  {
    id: "CODE_RED",
    label: "Code Red",
    description: "Active threat. Hide silently, lock & barricade.",
    icon: ShieldAlert,
    accent: {
      text: "text-rose-400",
      ring: "ring-rose-500",
      bg: "bg-rose-500/10",
      border: "border-rose-500",
      glow: "shadow-[0_0_24px_rgba(244,63,94,0.45)]",
    },
  },
];

export function getScenario(id: Scenario): ScenarioConfig {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}
