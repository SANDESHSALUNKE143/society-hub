import { describe, expect, test } from "bun:test";
import {
  firstFlatIdInWing,
  flatsInWing,
  uniqueWingNames,
  wingForFlatId,
  wingKey,
  wingLabel,
} from "./flat-picker";

const flats = [
  { id: "2", number: "201", wingName: "B" },
  { id: "1", number: "101", wingName: "A" },
  { id: "3", number: "102", wingName: "A" },
  { id: "4", number: "G1", wingName: "  " },
];

describe("flat-picker", () => {
  test("lists unique wings and flats in the chosen wing", () => {
    expect(uniqueWingNames(flats)).toEqual(["", "A", "B"]);
    expect(flatsInWing(flats, "A").map((f) => f.number)).toEqual(["101", "102"]);
    expect(firstFlatIdInWing(flats, "B")).toBe("2");
    expect(wingForFlatId(flats, "3")).toBe("A");
    expect(wingKey({ wingName: " A-C " })).toBe("A-C");
    expect(wingLabel("")).toBe("No wing");
    expect(wingLabel("A")).toBe("A");
  });
});
