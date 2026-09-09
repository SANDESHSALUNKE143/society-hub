import { describe, expect, test } from "bun:test";
import {
  INCLUDED_FOUR_WHEELER_PARKING,
  INCLUDED_TWO_WHEELER_PARKING,
  vehicleParkingQuotaMessage,
  vehiclesFromKindCount,
} from "./index";

describe("parking quota helpers", () => {
  test("included parking counts match FR-ONB-7", () => {
    expect(INCLUDED_TWO_WHEELER_PARKING).toBe(2);
    expect(INCLUDED_FOUR_WHEELER_PARKING).toBe(1);
  });

  test("vehiclesFromKindCount marks extras as purchased", () => {
    expect(vehiclesFromKindCount("two_wheeler", 0)).toEqual([]);
    expect(vehiclesFromKindCount("two_wheeler", 2)).toEqual([
      { kind: "two_wheeler", registrationNumber: null, parkingPurchased: false },
      { kind: "two_wheeler", registrationNumber: null, parkingPurchased: false },
    ]);
    expect(vehiclesFromKindCount("two_wheeler", 3).at(-1)).toMatchObject({
      parkingPurchased: true,
    });
    expect(vehiclesFromKindCount("four_wheeler", 2)).toEqual([
      { kind: "four_wheeler", registrationNumber: null, parkingPurchased: false },
      { kind: "four_wheeler", registrationNumber: null, parkingPurchased: true },
    ]);
  });

  test("vehicleParkingQuotaMessage flags unpaid extras", () => {
    expect(
      vehicleParkingQuotaMessage([
        { kind: "two_wheeler" },
        { kind: "two_wheeler" },
        { kind: "four_wheeler" },
      ]),
    ).toBeNull();
    expect(
      vehicleParkingQuotaMessage([
        { kind: "two_wheeler" },
        { kind: "two_wheeler" },
        { kind: "two_wheeler" },
      ]),
    ).toContain("purchased parking");
    expect(
      vehicleParkingQuotaMessage([
        { kind: "four_wheeler" },
        { kind: "four_wheeler" },
      ]),
    ).toContain("Four-wheeler");
  });
});
