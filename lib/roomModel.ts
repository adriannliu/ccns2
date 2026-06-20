import type { Point2D, RoomLandmark, RoomModel } from "./types";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

/** Coerce assorted model output into a normalized [x, y] pair. */
export function normalizePoint2D(raw: unknown): Point2D | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const x = asNumber(raw[0]);
    const y = asNumber(raw[1]);
    if (x !== null && y !== null) return [x, y];
    return null;
  }

  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const x = asNumber(o.x ?? o.lng ?? o.left);
    const y = asNumber(o.y ?? o.lat ?? o.top);
    if (x !== null && y !== null) return [x, y];
  }

  return null;
}

/** Coerce a wall segment into [[x1,y1],[x2,y2]]. */
export function normalizeWallSegment(raw: unknown): Point2D[] | null {
  if (Array.isArray(raw)) {
    if (raw.length >= 2 && Array.isArray(raw[0])) {
      const a = normalizePoint2D(raw[0]);
      const b = normalizePoint2D(raw[1]);
      if (a && b) return [a, b];
    }

    if (raw.length >= 4 && !Array.isArray(raw[0])) {
      const a = normalizePoint2D([raw[0], raw[1]]);
      const b = normalizePoint2D([raw[2], raw[3]]);
      if (a && b) return [a, b];
    }

    return null;
  }

  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const a = normalizePoint2D(o.start ?? o.from ?? o.a);
    const b = normalizePoint2D(o.end ?? o.to ?? o.b);
    if (a && b) return [a, b];

    const x1 = asNumber(o.x1);
    const y1 = asNumber(o.y1);
    const x2 = asNumber(o.x2);
    const y2 = asNumber(o.y2);
    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
      return [
        [x1, y1],
        [x2, y2],
      ];
    }
  }

  return null;
}

function normalizeLandmark(raw: unknown): RoomLandmark | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const position = normalizePoint2D(o.position ?? o.coordinates ?? o.point);
  if (!position) return null;

  const label =
    typeof o.label === "string" && o.label.trim()
      ? o.label.trim()
      : typeof o.name === "string" && o.name.trim()
        ? o.name.trim()
        : "Landmark";

  const type =
    typeof o.type === "string" ? (o.type as RoomLandmark["type"]) : "furniture";

  return {
    label,
    type,
    position,
    detail: typeof o.detail === "string" ? o.detail : undefined,
  };
}

/** Defensively normalize VLM / stored room_model payloads. */
export function normalizeRoomModel(
  raw: Partial<RoomModel> | undefined,
): RoomModel | undefined {
  if (!raw) return undefined;

  const walls = (Array.isArray(raw.walls) ? raw.walls : [])
    .map(normalizeWallSegment)
    .filter((w): w is Point2D[] => w !== null);

  const exit_path = (Array.isArray(raw.exit_path) ? raw.exit_path : [])
    .map(normalizePoint2D)
    .filter((p): p is Point2D => p !== null);

  const landmarks = (Array.isArray(raw.landmarks) ? raw.landmarks : [])
    .map(normalizeLandmark)
    .filter((lm): lm is RoomLandmark => lm !== null);

  const scan_origin =
    normalizePoint2D(raw.scan_origin) ?? ([0.5, 0.82] as Point2D);

  if (
    walls.length === 0 &&
    landmarks.length === 0 &&
    exit_path.length === 0
  ) {
    return undefined;
  }

  return {
    walls,
    landmarks,
    exit_path,
    scan_origin,
  };
}
