"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { deleteRoom, renameRoom } from "@/lib/roomLibrary";
import { isDuplicateRoomLabel } from "@/lib/roomLabel";
import type { SavedRoom } from "@/lib/types";

interface RoomManageActionsProps {
  room: SavedRoom;
  rooms: SavedRoom[];
  onUpdated: (room: SavedRoom) => void;
  onDeleted: (id: string) => void;
  layout?: "row" | "header";
}

export default function RoomManageActions({
  room,
  rooms,
  onUpdated,
  onDeleted,
  layout = "row",
}: RoomManageActionsProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(room.label);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameLoading, setRenameLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const trimmedDraft = draftLabel.trim();
  const labelTaken =
    trimmedDraft.length > 0 &&
    isDuplicateRoomLabel(trimmedDraft, rooms, room.id);

  function startRename() {
    setDraftLabel(room.label);
    setRenameError(null);
    setEditing(true);
  }

  function cancelRename() {
    setDraftLabel(room.label);
    setRenameError(null);
    setEditing(false);
  }

  async function saveRename() {
    if (!trimmedDraft || labelTaken) return;
    setRenameLoading(true);
    setRenameError(null);
    try {
      const updated = await renameRoom(room.id, trimmedDraft);
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setRenameError(
        err instanceof Error ? err.message : "Could not rename room.",
      );
    } finally {
      setRenameLoading(false);
    }
  }

  async function confirmDelete() {
    setDeleteLoading(true);
    try {
      await deleteRoom(room.id);
      onDeleted(room.id);
      setDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  const buttonClass =
    layout === "header"
      ? "inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:text-white"
      : "inline-flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:text-white";

  if (editing) {
    return (
      <div className={layout === "header" ? "space-y-2" : "mt-2 space-y-2"}>
        <input
          type="text"
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          aria-invalid={labelTaken}
          className={`w-full rounded-lg border bg-slate-950/80 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 ${
            labelTaken
              ? "border-red-500/50 focus:border-red-500/60 focus:ring-red-500/40"
              : "border-slate-700 focus:border-emerald-500/60 focus:ring-emerald-500/40"
          }`}
        />
        {labelTaken ? (
          <p className="text-xs text-red-300">That name is already in use.</p>
        ) : null}
        {renameError ? (
          <p className="text-xs text-red-300">{renameError}</p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void saveRename()}
            disabled={!trimmedDraft || labelTaken || renameLoading}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
          >
            {renameLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            Save
          </button>
          <button
            type="button"
            onClick={cancelRename}
            disabled={renameLoading}
            className="flex-1 rounded-lg border border-slate-700 py-2 text-xs font-semibold text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={
          layout === "header"
            ? "flex flex-wrap gap-2"
            : "mt-2 flex flex-wrap gap-1.5"
        }
      >
        <button type="button" onClick={startRename} className={buttonClass}>
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </button>
        <button
          type="button"
          onClick={() => router.push(`/scan?rescan=${room.id}`)}
          className={buttonClass}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Re-scan
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className={`${buttonClass} hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300`}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        title={`Delete ${room.label}?`}
        message="This removes all plans and cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={deleteLoading}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
