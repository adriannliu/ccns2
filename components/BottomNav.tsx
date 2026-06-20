"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderOpen, Home, ScanLine, Siren } from "lucide-react";

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/rooms", label: "Rooms", icon: FolderOpen },
  { href: "/scan", label: "Set Up", icon: ScanLine },
  { href: "/emergency", label: "Emergency", icon: Siren, accent: true },
] as const;

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 px-2 py-2">
        {LINKS.map((link) => {
          const { href, label, icon: Icon } = link;
          const accent = "accent" in link && link.accent;
          const active =
            href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-semibold transition ${
                active
                  ? accent
                    ? "text-red-400"
                    : "text-emerald-400"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Icon className={`h-5 w-5 ${accent && active ? "text-red-400" : ""}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
