import { NextResponse } from "next/server";
import { butterbase, isButterbaseConfigured } from "@/lib/butterbase";
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

  const rooms = (Array.isArray(res.data) ? res.data : []).map(normalizeRecord);
  return NextResponse.json({ rooms });
}

function normalizeRecord(raw: SavedRoom | Record<string, unknown>): SavedRoom {
  const r = raw as SavedRoom;
  return {
    id: String(r.id ?? ""),
    label: String(r.label ?? "Unnamed room"),
    image: String(r.image ?? ""),
    panorama: r.panorama ? String(r.panorama) : undefined,
    scanMode: r.scanMode === "photo" ? "photo" : "video360",
    plans: r.plans as SavedRoom["plans"],
    createdAt: Number(r.createdAt ?? Date.now()),
  };
}
