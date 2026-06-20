import { NextResponse } from "next/server";
import { butterbase, isButterbaseConfigured } from "@/lib/butterbase";
import { buildAnalyzeInput, resolveDisplayImageUrl } from "@/lib/analyzeInput";
import { ALL_SCENARIOS, runSpatialAnalysis } from "@/lib/spatialAnalysis";
import type { SavedRoom, ScenarioPlans, SetupRoomRequest } from "@/lib/types";

export const runtime = "nodejs";

const TABLE = process.env.BUTTERBASE_ROOMS_TABLE ?? "rooms";

/** POST /api/rooms/setup — map a room and pre-compute all emergency plans. */
export async function POST(req: Request) {
  let body: SetupRoomRequest;
  try {
    body = (await req.json()) as SetupRoomRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const label = body.label?.trim();
  if (!label) {
    return NextResponse.json({ error: "Room label is required." }, { status: 400 });
  }

  let built;
  try {
    built = buildAnalyzeInput(body);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid capture payload." },
      { status: 400 },
    );
  }

  try {
    const results = await Promise.all(
      ALL_SCENARIOS.map(async (scenario) => {
        const { result } = await runSpatialAnalysis(built.input, scenario);
        return [scenario, result] as const;
      }),
    );

    const plans = Object.fromEntries(results) as ScenarioPlans;
    const displayUrl =
      body.previewImage ??
      body.panorama ??
      (await resolveDisplayImageUrl(built.input, built.imageUrl));

    const room: SavedRoom = {
      id: `room_${Date.now()}`,
      label,
      image: displayUrl ?? body.previewImage ?? "",
      panorama: body.panorama,
      scanMode: body.scanMode ?? built.input.mode,
      plans,
      createdAt: Date.now(),
    };

    if (isButterbaseConfigured()) {
      const res = await butterbase.insert(
        { ...room, created_at: new Date().toISOString() },
        TABLE,
      );
      if (res.success && res.id) room.id = res.id;
    }

    return NextResponse.json(room);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Room setup failed unexpectedly.",
      },
      { status: 502 },
    );
  }
}
