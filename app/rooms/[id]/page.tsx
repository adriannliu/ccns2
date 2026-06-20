"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import ImageOverlay from "@/components/ImageOverlay";
import RoomModelView from "@/components/RoomModelView";
import { getRoomById, listRooms } from "@/lib/roomLibrary";
import { buildPlansMapView, buildRoomMapView } from "@/lib/roomMapView";
import type { AnalysisResult, SavedRoom } from "@/lib/types";

export default function RoomDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [room, setRoom] = useState<SavedRoom | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = getRoomById(id);
    if (cached) setRoom(cached);

    void listRooms()
      .then((rooms) => setRoom(rooms.find((r) => r.id === id) ?? cached ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  const mapView = useMemo(() => {
    if (!room) return null;
    try {
      return buildRoomMapView(room);
    } catch {
      return {
        egress_points: [],
        safe_zones: [],
        hazards: [],
        actionable_instructions: [],
      };
    }
  }, [room]);

  const labeledFrames = useMemo(() => {
    if (!room?.frameImages?.length || !room.framePlans?.length) return [];
    return room.frameImages.map((imageSrc, index) => {
      const plans = room.framePlans?.[index];
      const result: AnalysisResult = plans
        ? buildPlansMapView(plans)
        : {
            egress_points: [],
            safe_zones: [],
            hazards: [],
            actionable_instructions: [],
          };
      const overlayCount =
        result.egress_points.length + result.safe_zones.length;
      return { imageSrc, result, overlayCount, index };
    });
  }, [room]);

  const hasLabeledFrames = labeledFrames.some((frame) => frame.overlayCount > 0);

  const overlayCount = useMemo(() => {
    if (!mapView) return 0;
    return mapView.egress_points.length + mapView.safe_zones.length;
  }, [mapView]);

  if (loading) {
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </main>
    );
  }

  if (!room || !mapView) {
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6">
        <Link
          href="/rooms"
          className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to saved rooms
        </Link>
        <p className="text-slate-400">Room not found.</p>
      </main>
    );
  }

  return (
    <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6 pb-24">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/rooms"
          className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white"
          aria-label="Back to saved rooms"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold tracking-tight">
            {room.label}
          </h1>
          <p className="text-sm text-slate-400">
            {room.scanMode === "video360" ? "360° video scan" : "Photo scan"} ·{" "}
            {new Date(room.createdAt).toLocaleDateString()}
          </p>
        </div>
      </header>

      <section className="space-y-4">
        {mapView.room_model ? (
          <RoomModelView model={mapView.room_model} hideHazards />
        ) : null}

        {room.panorama ? (
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Panorama
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={room.panorama}
              alt={`Panorama of ${room.label}`}
              className="max-h-48 w-full object-cover"
            />
          </div>
        ) : null}

        {labeledFrames.length > 0 ? (
          <div className="space-y-4">
            <div className="px-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Labeled frames
              </p>
              <p className="text-xs text-slate-400">
                Each view from your scan — exits, windows, and shelter spots.
              </p>
            </div>
            {labeledFrames.map(({ imageSrc, result, overlayCount, index }) => (
              <div
                key={`frame-${index}`}
                className="rounded-2xl border border-slate-800 bg-slate-950/80"
              >
                <div className="border-b border-slate-800 px-4 py-2">
                  <p className="text-xs font-semibold text-slate-400">
                    Frame {index + 1} of {labeledFrames.length}
                  </p>
                </div>
                <div className="overflow-visible p-3">
                  {overlayCount > 0 ? (
                    <ImageOverlay
                      imageSrc={imageSrc}
                      result={result}
                      variant="library"
                      maxHeightClass="max-h-[45vh]"
                    />
                  ) : (
                    <div className="space-y-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageSrc}
                        alt={`Frame ${index + 1}`}
                        className="max-h-[45vh] w-full rounded-xl object-contain"
                      />
                      <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                        No labels for this angle — check other frames or the
                        floor plan above.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : room.image ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80">
            <div className="border-b border-slate-800 px-4 py-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Labeled scan
              </p>
              <p className="text-xs text-slate-400">
                Exits, windows, and shelter spots — dotted line to nearest exit.
              </p>
            </div>
            <div className="overflow-visible p-3">
              {overlayCount > 0 ? (
                <ImageOverlay
                  imageSrc={room.image}
                  result={mapView}
                  variant="library"
                  maxHeightClass="max-h-[55vh]"
                />
              ) : mapView.room_model ? (
                <p className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-400">
                  Photo labels are not available for this scan. Use the top-down
                  room map above for exits, windows, and shelter spots.
                </p>
              ) : (
                <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  No labels were saved for this room. Delete it and scan again
                  from the Set Up tab to rebuild the map.
                </p>
              )}
            </div>
          </div>
        ) : !hasLabeledFrames && !mapView.room_model ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            No labels were saved for this room. Delete it and scan again from
            the Set Up tab to rebuild the map.
          </p>
        ) : null}
      </section>
    </main>
  );
}
