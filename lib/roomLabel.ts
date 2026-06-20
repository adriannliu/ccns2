/** Normalize a room label for display and comparison. */
export function normalizeRoomLabel(label: string): string {
  return label.trim();
}

/** Case-insensitive equality check for room labels. */
export function roomLabelsMatch(a: string, b: string): boolean {
  return (
    normalizeRoomLabel(a).toLowerCase() === normalizeRoomLabel(b).toLowerCase()
  );
}

/** Whether another saved room already uses this label. */
export function isDuplicateRoomLabel(
  label: string,
  rooms: Array<{ id: string; label: string }>,
  excludeId?: string,
): boolean {
  return rooms.some(
    (room) => room.id !== excludeId && roomLabelsMatch(room.label, label),
  );
}
