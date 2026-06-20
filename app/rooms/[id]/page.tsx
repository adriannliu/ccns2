"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Siren } from "lucide-react";
import CachedRoomImage from "@/components/CachedRoomImage";
import DrillMode from "@/components/DrillMode";
import ImageOverlay from "@/components/ImageOverlay";
import PlanRegionLists from "@/components/PlanRegionLists";
import PrintPlanButton from "@/components/PrintPlanButton";
import RoomManageActions from "@/components/RoomManageActions";
import RoomModelView from "@/components/RoomModelView";
import { imageOverlayCaption } from "@/lib/exitPath";
import { formatPlanAge, isPlanStale } from "@/lib/planAge";
import { listRooms } from "@/lib/roomLibrary";
import { buildPlansMapView, buildRoomMapView } from "@/lib/roomMapView";
import { SCENARIOS } from "@/lib/scenarios";
import type { AnalysisResult, SavedRoom, Scenario } from "@/lib/types";

export default function RoomDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [room, setRoom] = useState<SavedRoom | null>(null);
  const [rooms, setRooms] = useState<SavedRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewScenario, setPreviewScenario] = useState<Scenario | "merged">(
    "merged",
  );

  useEffect(() => {
    void listRooms()
      .then((all) => {
        setRooms(all);
        setRoom(all.find((r) => r.id === id) ?? null);
      })
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

  const scenarioPreview = useMemo((): AnalysisResult | null => {
    if (!room || previewScenario === "merged") return mapView;
    return room.plans[previewScenario] ?? null;
  }, [room, previewScenario, mapView]);

  const labeledFrames = useMemo(() => {
    if (!room?.frameImages?.length || !room.framePlans?.length) return [];
    return room.frameImages.map((imageSrc, index) => {
      const plans = room.framePlans?.[index];
      const result: AnalysisResult =
        previewScenario === "merged"
          ? plans
            ? buildPlansMapView(plans)
            : {
                egress_points: [],
                safe_zones: [],
                hazards: [],
                actionable_instructions: [],
              }
          : plans?.[previewScenario] ?? {
              egress_points: [],
              safe_zones: [],
              hazards: [],
              actionable_instructions: [],
            };
      const overlayCount =
        result.egress_points.length + result.safe_zones.length;
      return { imageSrc, result, overlayCount, index };
    });
  }, [room, previewScenario]);

  const hasLabeledFrames = labeledFrames.some((frame) => frame.overlayCount > 0);

  const overlayCount = useMemo(() => {
    if (!scenarioPreview) return 0;
    return (
      scenarioPreview.egress_points.length + scenarioPreview.safe_zones.length
    );
  }, [scenarioPreview]);

  if (loading) {
    return (
      <main className="bg-grid mx-auto flex min-h-screen w-full max-w-md items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
      </main>
    );
  }

  if (!room || !mapView || !scenarioPreview) {
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

  const planAge = formatPlanAge(room.createdAt);
  const stale = isPlanStale(room.createdAt);

  return (
    <main className="print-plan-root bg-grid mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pt-6 pb-24">
      <header className="mb-6 flex items-center gap-3">
        <Link
          href="/rooms"
          className="rounded-full border border-slate-800 bg-slate-900/60 p-2 text-slate-300 transition hover:text-white print:hidden"
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
          <p
            className={`mt-0.5 text-xs ${stale ? "text-amber-400" : "text-slate-500"}`}
          >
            {planAge}
            {stale ? " — consider re-scanning" : ""}
          </p>
        </div>
        <PrintPlanButton className="print:hidden" />
      </header>

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Link
          href={`/emergency?room=${room.id}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500/15 px-4 py-3 text-sm font-bold text-red-300 ring-1 ring-red-500/30"
        >
          <Siren className="h-4 w-4" />
          View emergency plan
        </Link>
      </div>

      <RoomManageActions
        room={room}
        rooms={rooms}
        layout="header"
        onUpdated={(updated) => {
          setRoom(updated);
          setRooms((prev) =>
            prev.map((entry) => (entry.id === updated.id ? updated : entry)),
          );
        }}
        onDeleted={() => router.push("/rooms")}
      />

      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-3 print:hidden">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Preview scenario
        </p>
        <div className="flex flex-wrap gap-2">
          <ScenarioTab
            active={previewScenario === "merged"}
            label="All scenarios"
            onClick={() => setPreviewScenario("merged")}
          />
          {SCENARIOS.map((s) => (
            <ScenarioTab
              key={s.id}
              active={previewScenario === s.id}
              label={s.label}
              onClick={() => setPreviewScenario(s.id)}
            />
          ))}
        </div>
      </div>

      <DrillMode room={room} />

      <section className="mt-4 space-y-4">
        {scenarioPreview.room_model ? (
          <RoomModelView
            model={scenarioPreview.room_model}
            scenario={previewScenario === "merged" ? undefined : previewScenario}
            hideHazards
          />
        ) : mapView.room_model && previewScenario === "merged" ? (
          <RoomModelView model={mapView.room_model} hideHazards />
        ) : null}

        {room.panorama ? (
          <div className="overflow-hidden rounded-2xl border border-slate-800">
            <p className="border-b border-slate-800 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Panorama
            </p>
            <CachedRoomImage
              roomId={room.id}
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
                {room.scanMode === "photo" ? "Labeled photos" : "Labeled frames"}
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
                    {room.scanMode === "photo" ? "Photo" : "Frame"}{" "}
                    {index + 1} of {labeledFrames.length}
                  </p>
                  <p className="text-xs text-slate-500">
                    {imageOverlayCaption(
                      result,
                      previewScenario === "merged" ? undefined : previewScenario,
                    )}
                  </p>
                </div>
                <div className="overflow-visible p-3">
                  {overlayCount > 0 ? (
                    <ImageOverlay
                      imageSrc={imageSrc}
                      cacheRoomId={room.id}
                      cacheIndex={index}
                      result={result}
                      scenario={
                        previewScenario === "merged" ? undefined : previewScenario
                      }
                      variant="library"
                      maxHeightClass="max-h-[45vh]"
                    />
                  ) : (
                    <div className="space-y-3">
                      <CachedRoomImage
                        roomId={room.id}
                        src={imageSrc}
                        index={index}
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
                {imageOverlayCaption(
                  scenarioPreview,
                  previewScenario === "merged" ? undefined : previewScenario,
                )}
              </p>
            </div>
            <div className="overflow-visible p-3">
              {overlayCount > 0 ? (
                <ImageOverlay
                  imageSrc={room.image}
                  cacheRoomId={room.id}
                  result={scenarioPreview}
                  scenario={
                    previewScenario === "merged" ? undefined : previewScenario
                  }
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

        {previewScenario !== "merged" && overlayCount > 0 ? (
          <PlanRegionLists result={scenarioPreview} />
        ) : null}
      </section>
    </main>
  );
}

function ScenarioTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-emerald-500 text-slate-950"
          : "border border-slate-800 text-slate-400 hover:text-slate-200"
      }`}
    >
      {label}
    </button>
  );
}
