import type { SavedRoom } from "./types";

const KEY = "safespace:saved-rooms";

function readLocal(): SavedRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedRoom[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(rooms: SavedRoom[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(rooms));
  } catch {
    // Quota exceeded — keep in-memory only for this session.
  }
}

let memoryRooms: SavedRoom[] | null = null;

function allLocal(): SavedRoom[] {
  if (memoryRooms) return memoryRooms;
  memoryRooms = readLocal();
  return memoryRooms;
}

/** List saved rooms (local first, then merge remote). */
export async function listRooms(): Promise<SavedRoom[]> {
  const local = allLocal();

  try {
    const res = await fetch("/api/rooms", { cache: "no-store" });
    if (!res.ok) return local.sort((a, b) => b.createdAt - a.createdAt);
    const remote = (await res.json()) as { rooms?: SavedRoom[] };
    const merged = new Map<string, SavedRoom>();
    for (const r of remote.rooms ?? []) merged.set(r.id, r);
    for (const r of local) merged.set(r.id, r);
    const list = [...merged.values()].sort((a, b) => b.createdAt - a.createdAt);
    memoryRooms = list;
    writeLocal(list);
    return list;
  } catch {
    return local.sort((a, b) => b.createdAt - a.createdAt);
  }
}

export function getRoomById(id: string): SavedRoom | null {
  return allLocal().find((r) => r.id === id) ?? null;
}

export function upsertRoomLocal(room: SavedRoom): void {
  const rooms = allLocal().filter((r) => r.id !== room.id);
  rooms.unshift(room);
  memoryRooms = rooms;
  writeLocal(rooms);
}

export async function deleteRoom(id: string): Promise<void> {
  memoryRooms = allLocal().filter((r) => r.id !== id);
  writeLocal(memoryRooms);
  try {
    await fetch(`/api/rooms/${id}`, { method: "DELETE" });
  } catch {
    // Local delete still succeeded.
  }
}

export async function setupRoom(
  payload: Record<string, unknown>,
): Promise<SavedRoom> {
  const res = await fetch("/api/rooms/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Setup failed (${res.status})`);
  }
  const room = (await res.json()) as SavedRoom;
  upsertRoomLocal(room);
  return room;
}
