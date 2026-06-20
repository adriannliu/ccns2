"use client";

import BottomNav from "./BottomNav";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistration />
      <div className="pb-20">{children}</div>
      <BottomNav />
    </>
  );
}
