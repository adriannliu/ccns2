import type { AnalyzeResponse, Scenario } from "./types";

/**
 * Lightweight client-side hand-off between /scan and /results.
 *
 * Keeps the latest scan in memory so large base64 photos are not capped by
 * sessionStorage's ~5 MB quota. sessionStorage is still used as a best-effort
 * fallback for page refresh when the payload is small enough.
 */
const KEY = "safespace:last-scan";

/** In-tab hand-off — no size limit beyond available memory. */
let memoryScan: StoredScan | null = null;

export interface StoredScan {
  image: string;
  panorama?: string;
  scanMode?: "photo" | "video360";
  scenario: Scenario;
  result: AnalyzeResponse;
  createdAt: number;
}

export function saveScan(scan: StoredScan): void {
  memoryScan = scan;
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(scan));
  } catch {
    // Large photos exceed sessionStorage quota; in-memory scan still works.
  }
}

export function loadScan(): StoredScan | null {
  if (memoryScan) return memoryScan;
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredScan) : null;
  } catch {
    return null;
  }
}

export function clearScan(): void {
  memoryScan = null;
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
