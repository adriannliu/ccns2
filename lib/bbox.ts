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

export function bboxSize(box: BBox): { width: number; height: number } {
  const [ymin, xmin, ymax, xmax] = box;
  return {
    width: Math.abs(xmax - xmin),
    height: Math.abs(ymax - ymin),
  };
}

/** Overhead/ceiling architecture and HVAC — not valid safe zones. */
export function isOverheadSafeZoneBBox(box: BBox): boolean {
  const [ymin, , ymax] = box;
  const { width, height } = bboxSize(box);
  const centerY = (ymin + ymax) / 2;
  if (ymax <= 0.42) return true;
  if (centerY < 0.36) return true;
  if (centerY < 0.46 && width >= height * 1.1) return true;
  return false;
}

/** Tall narrow vertical boxes (pillars/columns) are not valid cover. */
export function isPlausibleSafeZoneBBox(box: BBox): boolean {
  const { width, height } = bboxSize(box);
  if (height < 0.06 || width < 0.02) return false;
  if (width < 0.18 && height > width * 1.6) return false;
  if (isOverheadSafeZoneBBox(box)) return false;
  return true;
}

/** Drop & Cover = floor-level desk/table only — not beams, ducts, or columns. */
export function isPlausibleDropAndCoverBBox(box: BBox): boolean {
  if (!isPlausibleSafeZoneBBox(box)) return false;
  const [ymin, , ymax] = box;
  const { width, height } = bboxSize(box);
  const centerY = (ymin + ymax) / 2;
  if (ymax < 0.55) return false;
  if (centerY < 0.42) return false;
  if (width < 0.14 && height > width * 1.4) return false;
  return true;
}

/** Doors are vertical openings; reject wide horizontal strips mislabeled as doors. */
export function isPlausibleDoorBBox(box: BBox): boolean {
  const { width, height } = bboxSize(box);
  if (height < 0.06 || width < 0.02) return false;
  return height >= width * 0.85;
}

export function bboxIoU(a: BBox, b: BBox): number {
  const [ay1, ax1, ay2, ax2] = a;
  const [by1, bx1, by2, bx2] = b;
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const interW = Math.max(0, ix2 - ix1);
  const interH = Math.max(0, iy2 - iy1);
  const inter = interW * interH;
  if (inter === 0) return 0;
  const areaA = Math.abs(ax2 - ax1) * Math.abs(ay2 - ay1);
  const areaB = Math.abs(bx2 - bx1) * Math.abs(by2 - by1);
  return inter / (areaA + areaB - inter);
}
