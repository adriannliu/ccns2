import { NextResponse } from "next/server";
import { butterbase, isButterbaseConfigured } from "@/lib/butterbase";
import { isDuplicateRoomLabel } from "@/lib/roomLabel";
import type { SavedRoom } from "@/lib/types";

export const runtime = "nodejs";

const TABLE = process.env.BUTTERBASE_ROOMS_TABLE ?? "rooms";

/** PATCH /api/rooms/[id] — rename a saved room. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Room id is required." }, { status: 400 });
  }

  let body: { label?: string };
  try {
    body = (await req.json()) as { label?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) {
    return NextResponse.json({ error: "Room label is required." }, { status: 400 });
  }

  if (isButterbaseConfigured()) {
    const listRes = await butterbase.list<SavedRoom | Record<string, unknown>>(TABLE);
    if (listRes.success && listRes.data) {
      const existing = (Array.isArray(listRes.data) ? listRes.data : []).map(
        (raw) => {
          const r = raw as SavedRoom;
          return { id: String(r.id ?? ""), label: String(r.label ?? "") };
        },
      );
      if (isDuplicateRoomLabel(label, existing, id)) {
        return NextResponse.json(
          {
            error: `A room named "${label}" already exists. Choose a different name.`,
          },
          { status: 409 },
        );
      }
    }

    await butterbase.update(
      id,
      {
        label,
        updated_at: new Date().toISOString(),
      },
      TABLE,
    );
  }

  return NextResponse.json({ id, label });
}

/** DELETE /api/rooms/[id] — remove a saved room (best-effort remote). */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const id = params.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Room id is required." }, { status: 400 });
  }

  if (isButterbaseConfigured()) {
    await butterbase.delete(id, TABLE);
  }

  return NextResponse.json({ success: true, id });
}
