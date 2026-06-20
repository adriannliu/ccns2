"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DoorOpen, Loader2, MapPin, Plus } from "lucide-react";
import RoomManageActions from "@/components/RoomManageActions";
import { listRooms } from "@/lib/roomLibrary";
import type { SavedRoom } from "@/lib/types";

export default function RoomsPage() {
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listRooms().then(setRooms).finally(() => setLoading(false));
  }, []);

  function handleUpdated(updated: SavedRoom) {
    setRooms((prev) =>
      prev.map((room) => (room.id === updated.id ? updated : room)),
    );
  }

  function handleDeleted(id: string) {
    setRooms((prev) => prev.filter((room) => room.id !== id));
  }

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Saved rooms</h1>
        <p className="mt-1 text-sm text-slate-400">
          Labeled room scans from setup.
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
              <div className="p-3">
                <div className="flex gap-3">
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
                        {room.scanMode === "video360" ? "360° video" : "Photo"}{" "}
                        · {new Date(room.createdAt).toLocaleDateString()}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Tap to view scan
                      </p>
                    </div>
                  </Link>
                </div>
                <RoomManageActions
                  room={room}
                  rooms={rooms}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
