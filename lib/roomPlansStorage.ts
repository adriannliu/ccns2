import { normalizeSavedRoom } from "./savedRoom";
import type { SavedRoom } from "./types";

const PREFIX = "safespace:room-plans:";

/** Persist analysis plans separately so large image URLs do not blow localStorage quota. */
export function persistRoomPlans(id: string, plans: SavedRoom["plans"]): void {
  if (typeof window === "undefined" || !id) return;
  try {
    localStorage.setItem(`${PREFIX}${id}`, JSON.stringify(plans));
  } catch {
    // Quota exceeded — in-memory copy still works for this session.
  }
}

export function loadRoomPlans(id: string): SavedRoom["plans"] | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    const raw = localStorage.getItem(`${PREFIX}${id}`);
    if (!raw) return null;
    return normalizeSavedRoom({ id, plans: JSON.parse(raw) as SavedRoom["plans"] })
      .plans;
  } catch {
    return null;
  }
}

export function deleteRoomPlans(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    localStorage.removeItem(`${PREFIX}${id}`);
  } catch {
    // ignore
  }
}
