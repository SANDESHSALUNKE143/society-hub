import { describe, expect, test } from "bun:test";
import { AppError } from "../../lib/errors";
import { resolveComplaintFlatId } from "./resolve-complaint-flat";

const linked = "11111111-1111-1111-1111-111111111111";
const other = "22222222-2222-2222-2222-222222222222";

describe("resolveComplaintFlatId", () => {
  test("resident uses the linked household flat", () => {
    expect(
      resolveComplaintFlatId({
        role: "resident",
        linkedFlatId: linked,
        requestedFlatId: undefined,
      }),
    ).toBe(linked);
  });

  test("tenant uses the linked household flat even if body repeats it", () => {
    expect(
      resolveComplaintFlatId({
        role: "tenant",
        linkedFlatId: linked,
        requestedFlatId: linked,
      }),
    ).toBe(linked);
  });

  test("resident cannot raise for another flat", () => {
    try {
      resolveComplaintFlatId({
        role: "resident",
        linkedFlatId: linked,
        requestedFlatId: other,
      });
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(403);
      expect((err as AppError).code).toBe("forbidden");
    }
  });

  test("unlinked resident cannot pass a random flatId", () => {
    try {
      resolveComplaintFlatId({
        role: "resident",
        linkedFlatId: null,
        requestedFlatId: other,
      });
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).code).toBe("no_flat");
    }
  });

  test("staff without a linked flat must select one", () => {
    try {
      resolveComplaintFlatId({
        role: "chairperson",
        linkedFlatId: null,
        requestedFlatId: null,
      });
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
      expect((err as AppError).code).toBe("no_flat");
    }
  });

  test("staff with a linked flat can raise for another lot", () => {
    expect(
      resolveComplaintFlatId({
        role: "chairperson",
        linkedFlatId: linked,
        requestedFlatId: other,
      }),
    ).toBe(other);
  });

  test("staff omit body flatId and fall back to the linked lot", () => {
    expect(
      resolveComplaintFlatId({
        role: "secretary",
        linkedFlatId: linked,
        requestedFlatId: undefined,
      }),
    ).toBe(linked);
  });
});
