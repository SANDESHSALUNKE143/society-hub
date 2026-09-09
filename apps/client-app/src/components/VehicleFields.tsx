import { ShField } from "@society-hub/ui";
import type { ResidentVehicleKind } from "@society-hub/types";
import { newVehicle, type VehicleDraft } from "../lib/vehicle-draft";

export function VehicleFields({
  kind,
  label,
  included,
  rows,
  onChange,
  testIdPrefix = "onboard",
  registrationOptional = false,
}: {
  kind: ResidentVehicleKind;
  label: string;
  included: number;
  rows: VehicleDraft[];
  onChange: (next: VehicleDraft[]) => void;
  testIdPrefix?: string;
  registrationOptional?: boolean;
}) {
  const noun = kind === "two_wheeler" ? "two-wheeler" : "four-wheeler";
  return (
    <div className="sh-span-2 space-y-2" data-testid={`${testIdPrefix}-${kind}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-[11px] text-black/50">
          This flat has {included} included {noun} slot{included === 1 ? "" : "s"} left.
          Extra vehicles need purchased parking.
          {registrationOptional ? " Registration is optional." : ""}
        </p>
      </div>
      {rows.map((row, index) => {
        const extra = index >= included;
        return (
          <div
            key={row.id}
            className="grid gap-2 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
          >
            <ShField
              label={extra ? "Registration (extra)" : "Registration"}
              htmlFor={`${row.id}-reg`}
            >
              <input
                id={`${row.id}-reg`}
                className="input"
                value={row.registrationNumber}
                onChange={(e) =>
                  onChange(
                    rows.map((r) =>
                      r.id === row.id ? { ...r, registrationNumber: e.target.value } : r,
                    ),
                  )
                }
                placeholder={registrationOptional ? "Optional" : "MH12AB1234"}
              />
            </ShField>
            {extra ? (
              <label className="flex h-10 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={row.parkingPurchased}
                  onChange={(e) =>
                    onChange(
                      rows.map((r) =>
                        r.id === row.id ? { ...r, parkingPurchased: e.target.checked } : r,
                      ),
                    )
                  }
                />
                Purchased parking
              </label>
            ) : (
              <p className="text-xs text-black/45">Included parking</p>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
            >
              Remove
            </button>
            {extra && (
              <ShField
                label="Purchased slot (optional)"
                htmlFor={`${row.id}-slot`}
                className="sm:col-span-3"
              >
                <input
                  id={`${row.id}-slot`}
                  className="input"
                  value={row.parkingSlot}
                  onChange={(e) =>
                    onChange(
                      rows.map((r) =>
                        r.id === row.id ? { ...r, parkingSlot: e.target.value } : r,
                      ),
                    )
                  }
                />
              </ShField>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-testid={`${testIdPrefix}-add-${kind}`}
        onClick={() => onChange([...rows, newVehicle()])}
      >
        Add {noun}
      </button>
    </div>
  );
}
