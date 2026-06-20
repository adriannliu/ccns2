import type { AnalyzeResponse, Scenario } from "./types";

/**
 * Lightweight client-side hand-off between /scan and /results.
 *
 * For a hackathon mobile flow we avoid a global state lib and stash the most
 * recent scan in sessionStorage. Swap this out for a real store (or a
 * Butterbase fetch by id) when persistence requirements grow.
 */
const KEY = "safespace:last-scan";

export interface StoredScan {
  image: string;
  scenario: Scenario;
  result: AnalyzeResponse;
  createdAt: number;
}

export function saveScan(scan: StoredScan): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(scan));
  } catch {
    // sessionStorage can throw (private mode / quota). Fail soft.
  }
}

export function loadScan(): StoredScan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StoredScan) : null;
  } catch {
    return null;
  }
}

export function clearScan(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEY);
}
