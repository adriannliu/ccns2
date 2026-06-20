import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "SafeSpace — Spatial Emergency Intelligence",
  description:
    "Scan any indoor space and instantly generate escape routes, safe zones, and hiding spots for fire, earthquake, and code red scenarios.",
};

export const viewport: Viewport = {
  themeColor: "#020617",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
