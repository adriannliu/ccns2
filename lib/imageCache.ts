import type { SavedRoom } from "./types";

const DB_NAME = "safespace-images";
const STORE = "images";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function put(key: string, dataUrl: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(dataUrl, key);
    });
    db.close();
  } catch {
    // Best-effort cache — ignore quota or privacy mode failures.
  }
}

async function get(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      tx.onerror = () => reject(tx.error);
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}

function cacheKey(roomId: string, index = 0): string {
  return index === 0 ? `room:${roomId}:primary` : `room:${roomId}:frame:${index}`;
}

/** Persist display images for offline emergency use. */
export async function cacheRoomImages(
  room: SavedRoom,
  localPreviews?: string[],
): Promise<void> {
  const previews = localPreviews ?? [];
  const urls = room.frameImages?.length ? room.frameImages : [room.image];

  await Promise.all(
    urls.map(async (url, index) => {
      const preview = previews[index];
      if (preview?.startsWith("data:")) {
        await put(cacheKey(room.id, index), preview);
        return;
      }
      if (url?.startsWith("data:")) {
        await put(cacheKey(room.id, index), url);
      }
    }),
  );
}

/** Resolve a room image URL, preferring IndexedDB cache. */
export async function resolveRoomImage(
  roomId: string,
  remoteUrl: string,
  index = 0,
): Promise<string> {
  const cached = await get(cacheKey(roomId, index));
  if (cached) return cached;
  return remoteUrl;
}

/** Resolve all display images for a room. */
export async function resolveRoomImages(room: SavedRoom): Promise<string[]> {
  const urls = room.frameImages?.length ? room.frameImages : [room.image];
  return Promise.all(
    urls.map((url, index) => resolveRoomImage(room.id, url, index)),
  );
}
