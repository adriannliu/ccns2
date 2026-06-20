import Link from "next/link";
import { Flame, Activity, ShieldAlert, ScanLine, Radar } from "lucide-react";

export default function HomePage() {
  return (
    <main className="bg-grid relative mx-auto flex min-h-screen w-full max-w-md flex-col px-6 py-10">
      {/* Glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-emerald-500/15 to-transparent blur-2xl" />

      {/* Brand */}
      <div className="relative z-10 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-slate-950 shadow-neon">
          <Radar className="h-5 w-5" />
        </span>
        <span className="text-lg font-bold tracking-tight">SafeSpace</span>
      </div>

      {/* Hero */}
      <div className="relative z-10 mt-16 flex flex-1 flex-col">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <ScanLine className="h-3.5 w-3.5" /> Spatial Intelligence
        </span>

        <h1 className="mt-5 text-4xl font-black leading-[1.1] tracking-tight">
          Know your way out
          <span className="block text-emerald-400">before it happens.</span>
        </h1>

        <p className="mt-4 text-base leading-relaxed text-slate-400">
          Point your camera at any room. SafeSpace maps the exits, safe zones,
          and hazards — then hands you a step-by-step survival plan for fire,
          earthquake, or code red.
        </p>

        {/* Scenario chips */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          <ScenarioPill icon={<Flame className="h-5 w-5" />} label="Fire" />
          <ScenarioPill
            icon={<Activity className="h-5 w-5" />}
            label="Earthquake"
          />
          <ScenarioPill
            icon={<ShieldAlert className="h-5 w-5" />}
            label="Code Red"
          />
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-10 mt-10">
        <Link
          href="/scan"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 py-5 text-lg font-bold text-slate-950 shadow-neon transition active:scale-[0.99]"
        >
          <ScanLine className="h-6 w-6" />
          Scan Room
        </Link>
        <p className="mt-3 text-center text-xs text-slate-500">
          Works best in the room you want to map.
        </p>
      </div>
    </main>
  );
}

function ScenarioPill({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/50 py-4 text-slate-300">
      <span className="text-emerald-400">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
