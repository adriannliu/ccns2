"use client";

import { Printer } from "lucide-react";

interface PrintPlanButtonProps {
  label?: string;
  className?: string;
}

export default function PrintPlanButton({
  label = "Print plan",
  className = "",
}: PrintPlanButtonProps) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={`inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:text-white print:hidden ${className}`}
    >
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
