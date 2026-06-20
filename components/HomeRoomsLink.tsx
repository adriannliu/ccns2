"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { listRooms } from "@/lib/roomLibrary";

export default function HomeRoomsLink() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    void listRooms().then((rooms) => setCount(rooms.length));
  }, []);

  if (count === 0) return null;

  return (
    <Link
      href="/rooms"
      className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 py-4 text-base font-semibold text-slate-200 transition hover:text-white"
    >
      <MapPin className="h-5 w-5" />
      View saved rooms ({count})
    </Link>
  );
}
