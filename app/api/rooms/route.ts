import { NextResponse } from "next/server";
import { butterbase, isButterbaseConfigured } from "@/lib/butterbase";
import { normalizeSavedRoom } from "@/lib/savedRoom";
import type { SavedRoom } from "@/lib/types";

export const runtime = "nodejs";

const TABLE = process.env.BUTTERBASE_ROOMS_TABLE ?? "rooms";

/** GET /api/rooms — list saved floor plans. */
export async function GET() {
  if (!isButterbaseConfigured()) {
    return NextResponse.json({ rooms: [] });
  }

  const res = await butterbase.list<SavedRoom | Record<string, unknown>>(TABLE);
  if (!res.success || !res.data) {
    return NextResponse.json({ rooms: [], error: res.error });
  }

  const rooms = (Array.isArray(res.data) ? res.data : []).map((raw) =>
    normalizeSavedRoom(raw as SavedRoom | Record<string, unknown>),
  );
  return NextResponse.json({ rooms });
}
