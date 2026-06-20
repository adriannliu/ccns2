import type { SavedRoom } from "./types";
import { roomLabelCount } from "./roomLabels";
import {
  deleteRoomPlans,
  loadRoomPlans,
  persistRoomPlans,
} from "./roomPlansStorage";
import { mergeSavedRooms, normalizeSavedRoom } from "./savedRoom";

const KEY = "safespace:saved-rooms";

/** Attach separately persisted plans when the room list entry is missing them. */
function attachStoredPlans(room: SavedRoom): SavedRoom {
  const stored = loadRoomPlans(room.id);
  const merged = stored ? mergeSavedRooms({ ...room, plans: stored }, room) : room;
  if (roomLabelCount(merged) > 0) {
    persistRoomPlans(merged.id, merged.plans);
  }
  return merged;
}

function readLocal(): SavedRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw
      ? (JSON.parse(raw) as SavedRoom[]).map((room) =>
          attachStoredPlans(normalizeSavedRoom(room)),
        )
      : [];
  } catch {
    return [];
  }
}

function writeLocal(rooms: SavedRoom[]): void {
  if (typeof window === "undefined") return;
  try {
    // Keep image URLs only in the index — plans live in roomPlansStorage.
    const slim = rooms.map(({ plans: _plans, ...meta }) => meta);
    localStorage.setItem(KEY, JSON.stringify(slim));
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
    for (const r of remote.rooms ?? []) {
      const normalized = attachStoredPlans(normalizeSavedRoom(r));
      const existing = merged.get(normalized.id);
      merged.set(
        normalized.id,
        existing ? mergeSavedRooms(existing, normalized) : normalized,
      );
    }
    for (const r of local) {
      const existing = merged.get(r.id);
      merged.set(r.id, existing ? mergeSavedRooms(r, existing) : r);
    }
    const list = [...merged.values()]
      .map(attachStoredPlans)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const room of list) {
      if (roomLabelCount(room) > 0) persistRoomPlans(room.id, room.plans);
    }
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
  const normalized = attachStoredPlans(normalizeSavedRoom(room));
  if (roomLabelCount(normalized) > 0) {
    persistRoomPlans(normalized.id, normalized.plans);
  }
  const rooms = allLocal().filter((r) => r.id !== normalized.id);
  rooms.unshift(normalized);
  memoryRooms = rooms;
  writeLocal(rooms);
}

export async function deleteRoom(id: string): Promise<void> {
  memoryRooms = allLocal().filter((r) => r.id !== id);
  writeLocal(memoryRooms);
  deleteRoomPlans(id);
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
  const normalized = normalizeSavedRoom(room);
  upsertRoomLocal(normalized);
  return normalized;
}
