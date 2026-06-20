import { NextResponse } from "next/server";
import { butterbase, isButterbaseConfigured } from "@/lib/butterbase";
import { createDownloadUrl, isS3Configured } from "@/lib/s3";
import { normalizeSavedRoom } from "@/lib/savedRoom";
import type { SavedRoom } from "@/lib/types";

export const runtime = "nodejs";

const TABLE = process.env.BUTTERBASE_ROOMS_TABLE ?? "rooms";

async function refreshRoomMedia(room: SavedRoom): Promise<SavedRoom> {
  if (!isS3Configured() || !room.frameKeys?.length) return room;

  const frameImages = await Promise.all(
    room.frameKeys.map((key) => createDownloadUrl(key)),
  );
  const image =
    room.frameKeys[0] != null
      ? await createDownloadUrl(room.frameKeys[0]).catch(() => room.image)
      : room.image;

  return { ...room, frameImages, image };
}

/** GET /api/rooms — list saved floor plans. */
export async function GET() {
  if (!isButterbaseConfigured()) {
    return NextResponse.json({ rooms: [] });
  }

  const res = await butterbase.list<SavedRoom | Record<string, unknown>>(TABLE);
  if (!res.success || !res.data) {
    return NextResponse.json({ rooms: [], error: res.error });
  }

  const rooms = await Promise.all(
    (Array.isArray(res.data) ? res.data : []).map(async (raw) =>
      refreshRoomMedia(
        normalizeSavedRoom(raw as SavedRoom | Record<string, unknown>),
      ),
    ),
  );
  return NextResponse.json({ rooms });
}
