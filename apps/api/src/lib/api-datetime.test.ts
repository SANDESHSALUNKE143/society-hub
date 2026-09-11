import { describe, expect, test } from "bun:test";
import { toApiIsoDateTime } from "./api-datetime";

describe("toApiIsoDateTime", () => {
  test("treats naive MySQL datetime as UTC", () => {
    expect(toApiIsoDateTime("2026-09-11 15:26:00.000")).toBe(
      "2026-09-11T15:26:00.000Z",
    );
    expect(toApiIsoDateTime("2026-09-11T15:26:00.123")).toBe(
      "2026-09-11T15:26:00.123Z",
    );
  });

  test("keeps an explicit offset as UTC ISO", () => {
    expect(toApiIsoDateTime("2026-09-11T15:26:00.000Z")).toBe(
      "2026-09-11T15:26:00.000Z",
    );
    expect(toApiIsoDateTime("2026-09-11T20:56:00.000+05:30")).toBe(
      "2026-09-11T15:26:00.000Z",
    );
  });

  test("passes through Date and empty values", () => {
    expect(toApiIsoDateTime(new Date("2026-09-11T15:26:00.000Z"))).toBe(
      "2026-09-11T15:26:00.000Z",
    );
    expect(toApiIsoDateTime("")).toBe("");
    expect(toApiIsoDateTime(null)).toBe("");
    expect(toApiIsoDateTime("not-a-date")).toBe("not-a-date");
  });
});
