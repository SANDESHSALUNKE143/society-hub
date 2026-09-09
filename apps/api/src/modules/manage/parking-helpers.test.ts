import { describe, expect, test } from "bun:test";
import {
  normalizeSocietyParking,
  parkingIdentitiesMatch,
  slotNumbersMatch,
  stripWingFromSlotNumber,
} from "./parking-helpers";

describe("parking-helpers", () => {
  test("slotNumbersMatch ignores case", () => {
    expect(slotNumbersMatch("101", "101")).toBe(true);
    expect(slotNumbersMatch("101", "102")).toBe(false);
  });

  test("stripWingFromSlotNumber drops a redundant wing prefix", () => {
    expect(stripWingFromSlotNumber("A", "A-101")).toBe("101");
    expect(stripWingFromSlotNumber("D", "D 12")).toBe("12");
    expect(stripWingFromSlotNumber("A", "101")).toBe("101");
    expect(stripWingFromSlotNumber("A", "D-101")).toBe("D-101");
  });

  test("puzzle uniqueness is wing + number", () => {
    const a = { kind: "puzzle" as const, wing: "A", slotNumber: "101" };
    expect(parkingIdentitiesMatch(a, { ...a, wing: "B" })).toBe(false);
    expect(parkingIdentitiesMatch(a, { ...a })).toBe(true);
    expect(
      parkingIdentitiesMatch(
        { kind: "open", wing: null, slotNumber: "12" },
        { kind: "open", wing: "A", slotNumber: "12" },
      ),
    ).toBe(true);
  });

  test("puzzle keeps wing and drops floor; strips wing from the number", () => {
    expect(
      normalizeSocietyParking({
        kind: "puzzle",
        wing: " A ",
        floor: 6,
        slotNumber: " A-12 ",
      }),
    ).toEqual({ kind: "puzzle", wing: "A", floor: null, slotNumber: "12" });
    expect(
      normalizeSocietyParking({
        kind: "open",
        wing: "  ",
        floor: 2,
        slotNumber: "OP-1",
      }),
    ).toEqual({ kind: "open", wing: null, floor: null, slotNumber: "OP-1" });
  });
});
