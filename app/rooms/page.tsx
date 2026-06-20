"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DoorOpen, Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { deleteRoom, listRooms } from "@/lib/roomLibrary";
import type { SavedRoom } from "@/lib/types";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listRooms().then(setRooms).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    await deleteRoom(id);
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Saved rooms</h1>
        <p className="mt-1 text-sm text-slate-400">
          Floor plans mapped during setup — used in an emergency.
        </p>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
        </div>
      ) : rooms.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
          <MapPin className="h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">
            No rooms saved yet. Scan and label a room to build your library.
          </p>
          <Link
            href="/scan"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 font-bold text-slate-950 shadow-neon"
          >
            <Plus className="h-5 w-5" />
            Set up a room
          </Link>
        </div>
      ) : (
        <ul className="space-y-3 pb-6">
          {rooms.map((room) => (
            <li
              key={room.id}
              className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50"
            >
              <div className="flex gap-3 p-3">
                <Link
                  href={`/rooms/${room.id}`}
                  className="flex min-w-0 flex-1 gap-3 transition hover:opacity-90"
                >
                  {room.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={room.image}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-800">
                      <DoorOpen className="h-6 w-6 text-slate-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-100">
                      {room.label}
                    </p>
                    <p className="text-xs text-slate-500">
                      {room.scanMode === "video360" ? "360° video" : "Photo"} ·{" "}
                      {new Date(room.createdAt).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-xs text-emerald-400/80">
                      Tap to view exits, cover zones & hazards
                    </p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleDelete(room.id);
                  }}
                  className="shrink-0 self-start rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400"
                  aria-label={`Delete ${room.label}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
