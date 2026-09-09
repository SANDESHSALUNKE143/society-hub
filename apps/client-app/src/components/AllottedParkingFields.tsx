import type { ParkingKind, ParkingSlotDto } from "@society-hub/types";
import {
  ShField,
  assignableParkingSlots,
  otherAssignedParkingSlots,
  parkingNumberHint,
  parkingSlotLabel,
} from "@society-hub/ui";

type Props = {
  parkings: ParkingSlotDto[];
  parkingKind: ParkingKind;
  parkingSlot: string;
  parkingSlotId: string;
  flatId: string;
  testIdPrefix: string;
  onKindChange: (kind: ParkingKind, slotNumber: string, slotId: string) => void;
  onSlotChange: (slotNumber: string, slotId: string) => void;
};

export function AllottedParkingFields({
  parkings,
  parkingKind,
  parkingSlot,
  parkingSlotId,
  flatId,
  testIdPrefix,
  onKindChange,
  onSlotChange,
}: Props) {
  const hint = parkingNumberHint(parkings, parkingKind, flatId, parkingSlotId);
  const kindId = `${testIdPrefix}-parking-kind`;
  const slotId = `${testIdPrefix}-parking`;

  return (
    <fieldset className="sh-span-2" data-testid={`${testIdPrefix}-allotted-parking`}>
      <legend className="label mb-1">Allotted parking</legend>
      {parkings.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <ShField label="Parking type" htmlFor={kindId}>
            <select
              id={kindId}
              data-testid={kindId}
              className="input"
              value={parkingKind}
              onChange={(e) => {
                const next = e.target.value as ParkingKind;
                const first = assignableParkingSlots(parkings, next, flatId, "")[0];
                onKindChange(next, first?.slotNumber ?? "", first?.id ?? "");
              }}
            >
              <option value="puzzle">Puzzle</option>
              <option value="open">Open</option>
            </select>
          </ShField>
          <ShField label="Parking number" htmlFor={slotId}>
            <select
              id={slotId}
              data-testid={slotId}
              className="input"
              value={parkingSlotId}
              onChange={(e) => {
                const id = e.target.value;
                onSlotChange(
                  parkings.find((p) => p.id === id)?.slotNumber ?? "",
                  id,
                );
              }}
            >
              <option value="">None</option>
              {assignableParkingSlots(
                parkings,
                parkingKind,
                flatId,
                parkingSlotId,
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {parkingSlotLabel(p)}
                </option>
              ))}
              {otherAssignedParkingSlots(
                parkings,
                parkingKind,
                flatId,
                parkingSlotId,
              ).map((p) => (
                <option key={p.id} value={p.id} disabled>
                  {parkingSlotLabel(p)}
                  {p.flatNumber ? ` · assigned to ${p.flatNumber}` : " · assigned"}
                </option>
              ))}
            </select>
          </ShField>
        </div>
      ) : (
        <ShField label="Parking number" htmlFor={slotId}>
          <input
            id={slotId}
            data-testid={slotId}
            className="input"
            value={parkingSlot}
            onChange={(e) => onSlotChange(e.target.value, "")}
            placeholder="Add parking in Manage first, or type a slot"
          />
        </ShField>
      )}
      {hint ? (
        <p className="mt-2 text-xs text-black/55" data-testid={`${testIdPrefix}-parking-hint`}>
          {hint}
        </p>
      ) : null}
    </fieldset>
  );
}
