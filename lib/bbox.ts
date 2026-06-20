import type { BBox } from "./types";

/** Coerce VLM / stored payloads into [ymin, xmin, ymax, xmax]. */
export function normalizeBBox(coordinates: unknown): BBox | null {
  if (Array.isArray(coordinates) && coordinates.length >= 4) {
    const nums = coordinates.slice(0, 4).map((v) => Number(v));
    if (!nums.some((n) => Number.isNaN(n))) return nums as BBox;
    return null;
  }

  if (coordinates && typeof coordinates === "object") {
    const o = coordinates as Record<string, unknown>;
    const ymin = Number(o.ymin ?? o.top ?? o.y1);
    const xmin = Number(o.xmin ?? o.left ?? o.x1);
    const ymax = Number(o.ymax ?? o.bottom ?? o.y2);
    const xmax = Number(o.xmax ?? o.right ?? o.x2);
    if (![ymin, xmin, ymax, xmax].some((n) => Number.isNaN(n))) {
      return [ymin, xmin, ymax, xmax];
    }
  }

  return null;
}

export function bboxCenter(coordinates: unknown): { x: number; y: number } {
  const box = normalizeBBox(coordinates);
  if (!box) return { x: 0.5, y: 0.5 };
  const [ymin, xmin, ymax, xmax] = box;
  return {
    x: (Math.min(xmin, xmax) + Math.max(xmin, xmax)) / 2,
    y: (Math.min(ymin, ymax) + Math.max(ymin, ymax)) / 2,
  };
}
