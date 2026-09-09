import {
  INCLUDED_FOUR_WHEELER_PARKING,
  INCLUDED_TWO_WHEELER_PARKING,
  type ResidentVehicleDto,
  type ResidentVehicleKind,
} from "@society-hub/types";

export type VehicleDraft = {
  id: string;
  registrationNumber: string;
  parkingPurchased: boolean;
  parkingSlot: string;
};

export function newVehicle(): VehicleDraft {
  return {
    id: crypto.randomUUID(),
    registrationNumber: "",
    parkingPurchased: false,
    parkingSlot: "",
  };
}

export function remainingIncluded(used: number | undefined, included: number) {
  return Math.max(0, included - (used ?? 0));
}

/** Included slots left for this person after other household vehicles. */
export function remainingIncludedForUser(
  householdCount: number | undefined,
  mySavedCount: number,
  included: number,
) {
  const others = Math.max(0, (householdCount ?? 0) - mySavedCount);
  return remainingIncluded(others, included);
}

export function householdVehiclesForQuota(opts: {
  twoWheelerCount?: number;
  fourWheelerCount?: number;
}) {
  const two = opts.twoWheelerCount ?? 0;
  const four = opts.fourWheelerCount ?? 0;
  return [
    ...Array.from({ length: two }, (_, i) => ({
      kind: "two_wheeler" as const,
      parkingPurchased: i >= INCLUDED_TWO_WHEELER_PARKING,
    })),
    ...Array.from({ length: four }, (_, i) => ({
      kind: "four_wheeler" as const,
      parkingPurchased: i >= INCLUDED_FOUR_WHEELER_PARKING,
    })),
  ];
}

export function otherHouseholdVehiclesForQuota(opts: {
  householdTwo: number | undefined;
  householdFour: number | undefined;
  myTwo: number;
  myFour: number;
}) {
  return householdVehiclesForQuota({
    twoWheelerCount: Math.max(0, (opts.householdTwo ?? 0) - opts.myTwo),
    fourWheelerCount: Math.max(0, (opts.householdFour ?? 0) - opts.myFour),
  });
}

export function draftsFromVehicles(
  vehicles: ResidentVehicleDto[] | undefined,
  kind: ResidentVehicleKind,
): VehicleDraft[] {
  return (vehicles ?? [])
    .filter((v) => v.kind === kind)
    .map((v) => ({
      id: crypto.randomUUID(),
      registrationNumber: v.registrationNumber ?? "",
      parkingPurchased: v.parkingPurchased,
      parkingSlot: v.parkingSlot ?? "",
    }));
}

export function toVehiclePayload(
  kind: ResidentVehicleKind,
  rows: VehicleDraft[],
  includedRemaining: number,
  opts?: { keepBlank?: boolean },
) {
  return rows
    .map((row, index) => {
      const plate = row.registrationNumber.trim().toUpperCase();
      const included = index < includedRemaining;
      return {
        kind,
        registrationNumber: plate.length >= 4 ? plate : null,
        parkingPurchased: included ? false : row.parkingPurchased,
        parkingSlot: row.parkingSlot.trim() || null,
      };
    })
    .filter((v) => opts?.keepBlank || (v.registrationNumber?.length ?? 0) >= 4);
}
