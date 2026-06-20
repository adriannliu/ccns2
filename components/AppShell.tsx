"use client";

import BottomNav from "./BottomNav";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pb-20">{children}</div>
      <BottomNav />
    </>
  );
}
