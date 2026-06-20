import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** DELETE /api/rooms/[id] — best-effort remote delete (local is source of truth). */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  return NextResponse.json({ success: true, id: params.id });
}
