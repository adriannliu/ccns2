import { normalizeSavedRoom } from "./savedRoom";
import type { FramePlans, SavedRoom } from "./types";

const PLANS_PREFIX = "safespace:room-plans:";
const FRAMES_PREFIX = "safespace:room-frame-plans:";

/** Persist analysis plans separately so large image URLs do not blow localStorage quota. */
export function persistRoomPlans(id: string, plans: SavedRoom["plans"]): void {
  if (typeof window === "undefined" || !id) return;
  try {
    localStorage.setItem(`${PLANS_PREFIX}${id}`, JSON.stringify(plans));
  } catch {
    // Quota exceeded — in-memory copy still works for this session.
  }
}

export function persistFramePlans(id: string, framePlans: FramePlans): void {
  if (typeof window === "undefined" || !id || framePlans.length === 0) return;
  try {
    localStorage.setItem(`${FRAMES_PREFIX}${id}`, JSON.stringify(framePlans));
  } catch {
    // Quota exceeded — in-memory copy still works for this session.
  }
}

export function loadRoomPlans(id: string): SavedRoom["plans"] | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = localStorage.getItem(`${PLANS_PREFIX}${id}`);
    if (!raw) return null;
    return normalizeSavedRoom({ id, plans: JSON.parse(raw) as SavedRoom["plans"] })
      .plans;
  } catch {
    return null;
  }
}

export function loadFramePlans(id: string): FramePlans | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = localStorage.getItem(`${FRAMES_PREFIX}${id}`);
    if (!raw) return null;
    return normalizeSavedRoom({ id, framePlans: JSON.parse(raw) as FramePlans })
      .framePlans ?? null;
  } catch {
    return null;
  }
}

export function deleteRoomPlans(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    localStorage.removeItem(`${PLANS_PREFIX}${id}`);
    localStorage.removeItem(`${FRAMES_PREFIX}${id}`);
  } catch {
    // ignore
  }
}
