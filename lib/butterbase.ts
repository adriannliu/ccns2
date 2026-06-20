/**
 * Generic Butterbase REST client.
 *
 * This is a thin, dependency-free wrapper around `fetch` so you can plug in
 * your real Butterbase credentials via environment variables later:
 *
 *   BUTTERBASE_API_URL   app API base, e.g. https://api.butterbase.ai/v1/app_xxx
 *   BUTTERBASE_API_KEY   your bb_sk_... service key
 *   BUTTERBASE_TABLE     default table/collection name (e.g. "scans")
 *
 * The data API is served at `${BUTTERBASE_API_URL}/${table}` (and
 * `.../${table}/${id}` for a single row), so BUTTERBASE_API_URL must already
 * include the `/v1/{app_id}` segment returned when the app was created.
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
    request<{ id: string }>(`/${table}`, {
      method: "POST",
      body: JSON.stringify(record),
    }),

  get: <T>(id: string, table = DEFAULT_TABLE) =>
    request<T>(`/${table}/${id}`, { method: "GET" }),

  list: <T>(table = DEFAULT_TABLE) =>
    request<T[]>(`/${table}`, { method: "GET" }),

  update: <T extends Record<string, unknown>>(
    id: string,
    record: T,
    table = DEFAULT_TABLE,
  ) =>
    request<{ id: string }>(`/${table}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(record),
    }),

  delete: (id: string, table = DEFAULT_TABLE) =>
    request<{ id: string }>(`/${table}/${id}`, { method: "DELETE" }),
};
