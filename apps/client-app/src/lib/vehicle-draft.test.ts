import { describe, expect, it } from "vitest";
import {
  remainingIncluded,
  remainingIncludedForUser,
  toVehiclePayload,
  type VehicleDraft,
} from "./vehicle-draft";

function draft(overrides: Partial<VehicleDraft> = {}): VehicleDraft {
  return {
    id: "1",
    registrationNumber: "",
    parkingPurchased: false,
    parkingSlot: "",
    ...overrides,
  };
}

describe("vehicle-draft", () => {
  it("computes remaining included slots for a household member", () => {
    expect(remainingIncluded(1, 2)).toBe(1);
    expect(remainingIncludedForUser(3, 1, 2)).toBe(0);
    expect(remainingIncludedForUser(1, 1, 2)).toBe(2);
  });

  it("keeps blank registrations when asked so counts can be saved", () => {
    const rows = [draft(), draft({ registrationNumber: "MH12TW0001" })];
    expect(toVehiclePayload("two_wheeler", rows, 2)).toHaveLength(1);
    expect(toVehiclePayload("two_wheeler", rows, 2, { keepBlank: true })).toEqual([
      {
        kind: "two_wheeler",
        registrationNumber: null,
        parkingPurchased: false,
        parkingSlot: null,
      },
      {
        kind: "two_wheeler",
        registrationNumber: "MH12TW0001",
        parkingPurchased: false,
        parkingSlot: null,
      },
    ]);
  });
});
