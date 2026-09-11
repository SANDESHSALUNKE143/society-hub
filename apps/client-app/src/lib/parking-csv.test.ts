import { describe, expect, it } from "vitest";
import { parseParkingCsv } from "./parking-csv";

describe("parseParkingCsv", () => {
  it("reads puzzle and open rows and ignores a leftover floor column", () => {
    const parsed = parseParkingCsv(
      "kind,wing,floor,slotNumber\npuzzle,A,1,A-101\npuzzle,B,2,101\nopen,,,12\n",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { kind: "puzzle", wing: "A", slotNumber: "101" },
      { kind: "puzzle", wing: "B", slotNumber: "101" },
      { kind: "open", wing: null, slotNumber: "12" },
    ]);
  });

  it("reports missing header and bad kind", () => {
    expect(parseParkingCsv("").errors[0]?.message).toBe("CSV is empty");
    expect(parseParkingCsv("wing\nA\n").errors[0]?.message).toContain(
      "kind and slotNumber",
    );
    const parsed = parseParkingCsv("kind,slotNumber\ncar,1\npuzzle,12\n");
    expect(parsed.errors[0]?.message).toContain("puzzle or open");
    expect(parsed.errors[1]?.message).toContain("Wing is required");
  });
});
