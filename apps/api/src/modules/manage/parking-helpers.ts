import type { ParkingKind, SocietyParkingInput } from "@society-hub/types";

export function slotNumbersMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function wingsMatch(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** Drop a leading "A-" / "A " when wing is already collected separately. */
export function stripWingFromSlotNumber(
  wing: string | null | undefined,
  slotNumber: string,
) {
  const slot = slotNumber.trim();
  const w = (wing ?? "").trim();
  if (!w) return slot;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return slot.replace(new RegExp(`^${escaped}[-\\s]+`, "i"), "");
}

export type ParkingIdentity = {
  kind: ParkingKind;
  wing: string | null;
  slotNumber: string;
};

export function parkingIdentitiesMatch(a: ParkingIdentity, b: ParkingIdentity) {
  if (a.kind !== b.kind || !slotNumbersMatch(a.slotNumber, b.slotNumber)) {
    return false;
  }
  if (a.kind === "open") return true;
  return wingsMatch(a.wing, b.wing);
}

export function parkingTakenMessage(input: ParkingIdentity) {
  if (input.kind === "puzzle") {
    return `Parking ${input.slotNumber} already exists for wing ${input.wing}`;
  }
  return `Parking ${input.slotNumber} already exists in this society`;
}

export function normalizeSocietyParking(input: {
  kind: ParkingKind;
  wing?: string | null;
  floor?: number | null;
  slotNumber: string;
}): SocietyParkingInput {
  if (input.kind === "puzzle") {
    const wing = (input.wing ?? "").trim();
    return {
      kind: "puzzle",
      wing,
      floor: null,
      slotNumber: stripWingFromSlotNumber(wing, input.slotNumber),
    };
  }
  const wing = (input.wing ?? "").trim();
  return {
    kind: "open",
    wing: wing || null,
    floor: null,
    slotNumber: input.slotNumber.trim(),
  };
}
