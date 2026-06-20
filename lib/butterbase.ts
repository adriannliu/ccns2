/**
 * Generic Butterbase REST client.
 *
 * This is a thin, dependency-free wrapper around `fetch` so you can plug in
 * your real Butterbase credentials via environment variables later:
 *
 *   BUTTERBASE_API_URL   e.g. https://api.butterbase.dev/v1
 *   BUTTERBASE_API_KEY   your secret key
 *   BUTTERBASE_TABLE     default table/collection name (e.g. "scans")
 *
 * Adjust the request/response shapes in `request()` and the CRUD helpers to
 * match Butterbase's actual API once you have docs/credentials.
 */

const BASE_URL = process.env.BUTTERBASE_API_URL ?? "";
const API_KEY = process.env.BUTTERBASE_API_KEY ?? "";
const DEFAULT_TABLE = process.env.BUTTERBASE_TABLE ?? "scans";

export interface ButterbaseResult<T> {
  success: boolean;
  data?: T;
  id?: string;
  error?: string;
}

/** Whether real credentials are configured. */
export function isButterbaseConfigured(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ButterbaseResult<T>> {
  if (!isButterbaseConfigured()) {
    return {
      success: false,
      error:
        "Butterbase is not configured. Set BUTTERBASE_API_URL and BUTTERBASE_API_KEY.",
    };
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });

    const body = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!res.ok) {
      return {
        success: false,
        error:
          (body.error as string) ?? `Butterbase request failed (${res.status})`,
      };
    }

    return {
      success: true,
      data: body as T,
      id: (body.id as string) ?? undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export const butterbase = {
  insert: <T extends Record<string, unknown>>(record: T, table = DEFAULT_TABLE) =>
    request<{ id: string }>(`/tables/${table}/rows`, {
      method: "POST",
      body: JSON.stringify(record),
    }),

  get: <T>(id: string, table = DEFAULT_TABLE) =>
    request<T>(`/tables/${table}/rows/${id}`, { method: "GET" }),

  list: <T>(table = DEFAULT_TABLE) =>
    request<T[]>(`/tables/${table}/rows`, { method: "GET" }),
};
