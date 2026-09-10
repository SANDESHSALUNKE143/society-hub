import { describe, expect, test } from "bun:test";
import {
  assignableParkingSlots,
  parkingKindOf,
  parkingNumberHint,
  parkingSlotLabel,
  preferredParkingKind,
} from "./parking-picker";

const openFree = {
  id: "open-1",
  kind: "open" as const,
  wing: null,
  slotNumber: "12",
  flatId: null,
  flatNumber: null,
};
const puzzleTaken = {
  id: "puz-1",
  kind: "puzzle" as const,
  wing: "A",
  slotNumber: "101",
  flatId: "other-flat",
  flatNumber: "202",
};
const puzzleMine = {
  id: "puz-2",
  kind: "puzzle" as const,
  wing: "A",
  slotNumber: "102",
  flatId: "flat-1",
  flatNumber: "101",
};

describe("parking-picker", () => {
  test("treats missing kind as open so older lots still list", () => {
    expect(parkingKindOf({ kind: "puzzle" })).toBe("puzzle");
    expect(parkingKindOf({ kind: "open" })).toBe("open");
    expect(parkingKindOf({ kind: "" as "open" })).toBe("open");
  });

  test("labels puzzle as wing · number", () => {
    expect(parkingSlotLabel(puzzleTaken)).toBe("A · 101");
    expect(parkingSlotLabel(openFree)).toBe("12");
  });

  test("hides lots already assigned to another flat", () => {
    const rows = [openFree, puzzleTaken, puzzleMine];
    expect(
      assignableParkingSlots(rows, "puzzle", "flat-1", "").map((p) => p.id),
    ).toEqual(["puz-2"]);
    expect(
      assignableParkingSlots(rows, "open", "flat-1", "").map((p) => p.id),
    ).toEqual(["open-1"]);
  });

  test("prefers the kind that actually has a free lot", () => {
    expect(preferredParkingKind([openFree], undefined, "flat-1", "")).toBe(
      "open",
    );
    expect(
      preferredParkingKind([openFree, puzzleMine], puzzleMine, "flat-1", "puz-2"),
    ).toBe("puzzle");
  });

  test("explains why Parking number is only None", () => {
    expect(parkingNumberHint([], "puzzle", "flat-1", "")).toContain(
      "Add parking lots in Manage",
    );
    expect(parkingNumberHint([openFree], "puzzle", "flat-1", "")).toContain(
      "Switch Parking type to Open",
    );
    expect(parkingNumberHint([puzzleTaken], "puzzle", "flat-1", "")).toContain(
      "assigned to other flats",
    );
    expect(parkingNumberHint([puzzleTaken, openFree], "puzzle", "flat-1", "")).toContain(
      "Switch to Open",
    );
    expect(preferredParkingKind([], undefined, "flat-1", "")).toBe("puzzle");
    expect(parkingNumberHint([puzzleTaken], "open", "flat-1", "")).toContain(
      "Switch Parking type to see Puzzle",
    );
  });
});
