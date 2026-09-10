import { describe, expect, test } from "bun:test";
import { AppError } from "../../lib/errors";
import { linkedFlatIdOrThrow } from "./household-helpers";

describe("linkedFlatIdOrThrow", () => {
  test("returns the linked flat", () => {
    expect(linkedFlatIdOrThrow("flat-1")).toBe("flat-1");
  });

  test("rejects accounts with no flat", () => {
    expect(() => linkedFlatIdOrThrow(null)).toThrow(AppError);
    expect(() => linkedFlatIdOrThrow(undefined)).toThrow(AppError);
    try {
      linkedFlatIdOrThrow(null);
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).code).toBe("flat_required");
    }
  });
});
