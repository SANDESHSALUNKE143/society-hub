import { describe, expect, it } from "vitest";
import { parseFlatCsv } from "./flat-csv";

describe("parseFlatCsv", () => {
  it("reads wing, floor, and flatNumber rows", () => {
    const parsed = parseFlatCsv("wing,floor,flatNumber\nA,3,101\nB,1,201\n");
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { wing: "A", floor: 3, flatNumber: "101" },
      { wing: "B", floor: 1, flatNumber: "201" },
    ]);
  });

  it("accepts wingName and number aliases", () => {
    const parsed = parseFlatCsv("wingName,floor,number\nA,0,G1\n");
    expect(parsed.rows[0]).toEqual({ wing: "A", floor: 0, flatNumber: "G1" });
  });

  it("reports a missing header", () => {
    const parsed = parseFlatCsv("name,phone\nAda,999\n");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]?.message).toContain("wing, floor, and flatNumber");
  });

  it("reports bad floor and empty csv", () => {
    expect(parseFlatCsv("").errors[0]?.message).toBe("CSV is empty");
    const parsed = parseFlatCsv("wing,floor,flatNumber\nA,x,101\n,1,102\nA,1,\n");
    expect(parsed.errors.map((e) => e.message)).toEqual([
      "Floor must be 0–200",
      "Wing is required",
      "Flat number is required",
    ]);
  });
});
