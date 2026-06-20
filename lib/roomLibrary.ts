import type { SavedRoom } from "./types";
import { cacheRoomImages } from "./imageCache";
import { roomLabelCount } from "./roomLabels";
import {
  deleteRoomPlans,
  loadFramePlans,
  loadRoomPlans,
  persistFramePlans,
  persistRoomPlans,
} from "./roomPlansStorage";
import { mergeSavedRooms, normalizeSavedRoom } from "./savedRoom";

const KEY = "safespace:saved-rooms";

/** Attach separately persisted plans when the room list entry is missing them. */
function attachStoredPlans(room: SavedRoom): SavedRoom {
  const stored = loadRoomPlans(room.id);
  const storedFrames = loadFramePlans(room.id);
  let merged = stored ? mergeSavedRooms({ ...room, plans: stored }, room) : room;
  if (storedFrames?.length) {
    merged = { ...merged, framePlans: storedFrames };
  }
  if (roomLabelCount(merged) > 0) {
    persistRoomPlans(merged.id, merged.plans);
    if (merged.framePlans?.length) {
      persistFramePlans(merged.id, merged.framePlans);
    }
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
    const slim = rooms.map(
      ({ plans: _plans, framePlans: _framePlans, ...meta }) => meta,
    );
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
      if (roomLabelCount(room) > 0) {
        persistRoomPlans(room.id, room.plans);
        if (room.framePlans?.length) persistFramePlans(room.id, room.framePlans);
      }
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
    if (normalized.framePlans?.length) {
      persistFramePlans(normalized.id, normalized.framePlans);
    }
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

export async function renameRoom(id: string, label: string): Promise<SavedRoom> {
  const res = await fetch(`/api/rooms/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: label.trim() }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? `Rename failed (${res.status})`);
  }

  const existing = getRoomById(id);
  if (!existing) {
    throw new Error("Room not found.");
  }

  const updated = normalizeSavedRoom({ ...existing, label: label.trim() });
  upsertRoomLocal(updated);
  return updated;
}

export async function rescanRoom(
  id: string,
  payload: Record<string, unknown>,
  localPreviews?: string[],
): Promise<SavedRoom> {
  return setupRoom({ ...payload, roomId: id }, localPreviews);
}

export async function setupRoom(
  payload: Record<string, unknown>,
  localPreviews?: string[],
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
  await cacheRoomImages(normalized, localPreviews);
  return normalized;
}
