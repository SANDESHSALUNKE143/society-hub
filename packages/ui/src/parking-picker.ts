import type { ParkingKind, ParkingSlotDto } from "@society-hub/types";

export type ParkingRow = Pick<
  ParkingSlotDto,
  "id" | "kind" | "wing" | "slotNumber" | "flatId" | "flatNumber"
>;

export function parkingKindOf(slot: Pick<ParkingRow, "kind">): ParkingKind {
  return slot.kind === "puzzle" ? "puzzle" : "open";
}

export function parkingKindLabel(kind: ParkingKind): string {
  return kind === "puzzle" ? "Puzzle" : "Open";
}

export function parkingSlotLabel(
  slot: Pick<ParkingRow, "kind" | "wing" | "slotNumber">,
): string {
  return parkingKindOf(slot) === "puzzle"
    ? `${slot.wing?.trim() || "—"} · ${slot.slotNumber}`
    : slot.slotNumber;
}

export function isParkingAssignable(
  slot: Pick<ParkingRow, "id" | "flatId">,
  flatId: string,
  currentSlotId: string,
): boolean {
  return !slot.flatId || slot.flatId === flatId || slot.id === currentSlotId;
}

export function parkingSlotsOfKind(
  slots: ParkingRow[],
  kind: ParkingKind,
): ParkingRow[] {
  return slots.filter((slot) => parkingKindOf(slot) === kind);
}

export function assignableParkingSlots(
  slots: ParkingRow[],
  kind: ParkingKind,
  flatId: string,
  currentSlotId: string,
): ParkingRow[] {
  return parkingSlotsOfKind(slots, kind).filter((slot) =>
    isParkingAssignable(slot, flatId, currentSlotId),
  );
}

export function otherAssignedParkingSlots(
  slots: ParkingRow[],
  kind: ParkingKind,
  flatId: string,
  currentSlotId: string,
): ParkingRow[] {
  return parkingSlotsOfKind(slots, kind).filter(
    (slot) => !isParkingAssignable(slot, flatId, currentSlotId),
  );
}

export function preferredParkingKind(
  slots: ParkingRow[],
  assigned: ParkingRow | undefined,
  flatId: string,
  currentSlotId: string,
): ParkingKind {
  if (assigned) return parkingKindOf(assigned);
  if (assignableParkingSlots(slots, "puzzle", flatId, currentSlotId).length) {
    return "puzzle";
  }
  if (assignableParkingSlots(slots, "open", flatId, currentSlotId).length) {
    return "open";
  }
  return "puzzle";
}

export function parkingNumberHint(
  slots: ParkingRow[],
  kind: ParkingKind,
  flatId: string,
  currentSlotId: string,
): string | null {
  if (slots.length === 0) {
    return "Add parking lots in Manage first, then pick a number here.";
  }
  const assignable = assignableParkingSlots(slots, kind, flatId, currentSlotId);
  if (assignable.length > 0) return null;

  const otherKind: ParkingKind = kind === "puzzle" ? "open" : "puzzle";
  const otherFree = assignableParkingSlots(
    slots,
    otherKind,
    flatId,
    currentSlotId,
  ).length;
  const takenHere = otherAssignedParkingSlots(
    slots,
    kind,
    flatId,
    currentSlotId,
  ).length;
  const kindLabel = parkingKindLabel(kind);
  const otherLabel = parkingKindLabel(otherKind);

  if (takenHere > 0 && otherFree > 0) {
    return `All ${kindLabel} lots are assigned to other flats. Switch to ${otherLabel} to see free lots, or clear a lot in Manage.`;
  }
  if (takenHere > 0) {
    return `All ${kindLabel} lots are assigned to other flats. Clear a lot in Manage to assign it here.`;
  }
  if (otherFree > 0) {
    return `No ${kindLabel} lots yet. Switch Parking type to ${otherLabel} to see the lots added in Manage.`;
  }
  if (parkingSlotsOfKind(slots, otherKind).length > 0) {
    return `No free ${kindLabel} lots. Switch Parking type to see ${otherLabel} lots.`;
  }
  return "No parking lots match this type. Add them in Manage.";
}
