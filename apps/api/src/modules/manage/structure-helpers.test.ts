import { describe, expect, test } from "bun:test";
import { wingNamesMatch } from "./structure-helpers";

describe("wingNamesMatch", () => {
  test("ignores case and surrounding spaces", () => {
    expect(wingNamesMatch("A", "a")).toBe(true);
    expect(wingNamesMatch(" A ", "A")).toBe(true);
    expect(wingNamesMatch("A", "B")).toBe(false);
  });
});
