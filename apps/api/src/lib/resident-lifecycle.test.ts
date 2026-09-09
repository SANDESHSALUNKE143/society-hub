import { describe, expect, test } from "bun:test";
import {
  OCCUPYING_STATUSES,
  activeKeyFor,
  assertTransition,
  canTransition,
  deriveOccupancy,
  isOccupying,
  isOwnerFor,
  statusAfterVerification,
  toMysqlDateTime,
} from "./resident-lifecycle";
import { AppError } from "./errors";

describe("occupancy predicate", () => {
  test("invited, pending, active and suspended all still occupy the flat", () => {
    expect(OCCUPYING_STATUSES).toEqual([
      "invited",
      "pending_verification",
      "active",
      "suspended",
    ]);
    for (const status of OCCUPYING_STATUSES) {
      expect(isOccupying(status)).toBe(true);
      expect(activeKeyFor(status)).toBe("Y");
    }
  });

  test("moved out and rejected free the flat", () => {
    expect(isOccupying("moved_out")).toBe(false);
    expect(isOccupying("rejected")).toBe(false);
    // NULL is what lets the partial unique index allow repeated history rows.
    expect(activeKeyFor("moved_out")).toBeNull();
    expect(activeKeyFor("rejected")).toBeNull();
  });
});

describe("lifecycle transitions", () => {
  test("allows the documented happy path", () => {
    expect(canTransition("invited", "pending_verification")).toBe(true);
    expect(canTransition("pending_verification", "active")).toBe(true);
    expect(canTransition("active", "moved_out")).toBe(true);
    expect(canTransition("active", "suspended")).toBe(true);
    expect(canTransition("suspended", "active")).toBe(true);
  });

  test("moved out is terminal", () => {
    expect(canTransition("moved_out", "active")).toBe(false);
    expect(canTransition("moved_out", "suspended")).toBe(false);
    expect(canTransition("moved_out", "moved_out")).toBe(false);
  });

  test("a rejected resident may be put back under review or approved", () => {
    expect(canTransition("rejected", "pending_verification")).toBe(true);
    expect(canTransition("rejected", "active")).toBe(true);
  });

  test("verification stays reviewable after approval", () => {
    // A document can turn out to be invalid after it was approved.
    expect(canTransition("active", "rejected")).toBe(true);
    expect(canTransition("suspended", "rejected")).toBe(true);
  });

  test("assertTransition rejects a no-op with 409", () => {
    let thrown: unknown;
    try {
      assertTransition("active", "active");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).status).toBe(409);
    expect((thrown as AppError).code).toBe("invalid_transition");
    expect((thrown as AppError).message).toContain("already active");
  });

  test("assertTransition rejects an illegal move with a readable message", () => {
    let thrown: unknown;
    try {
      assertTransition("moved_out", "active");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).message).toBe(
      "Cannot move a moved out resident to active",
    );
  });

  test("assertTransition passes a legal move", () => {
    expect(() => assertTransition("pending_verification", "active")).not.toThrow();
  });
});

describe("derived occupancy", () => {
  test("no live membership means vacant", () => {
    expect(deriveOccupancy([])).toBe("vacant");
  });

  test("owners only means owner occupied", () => {
    expect(deriveOccupancy([{ residentType: "owner" }])).toBe("owner_occupied");
    expect(
      deriveOccupancy([{ residentType: "owner" }, { residentType: "family" }]),
    ).toBe("owner_occupied");
  });

  test("any tenant makes the flat tenant occupied", () => {
    expect(deriveOccupancy([{ residentType: "tenant" }])).toBe("tenant_occupied");
    // Owner-plus-tenant is a real Indian scenario; the tenant fact wins.
    expect(
      deriveOccupancy([{ residentType: "owner" }, { residentType: "tenant" }]),
    ).toBe("tenant_occupied");
  });

  test("a household of family members alone is still owner occupied", () => {
    expect(deriveOccupancy([{ residentType: "family" }])).toBe("owner_occupied");
  });
});

describe("is_owner mirror", () => {
  test("tracks resident type", () => {
    expect(isOwnerFor("owner")).toBe(true);
    expect(isOwnerFor("tenant")).toBe(false);
    expect(isOwnerFor("family")).toBe(false);
  });
});

describe("status after verification", () => {
  test("approval activates the membership", () => {
    expect(statusAfterVerification("pending_verification", "approved")).toBe("active");
    expect(statusAfterVerification("invited", "approved")).toBe("active");
  });

  test("rejection marks the membership rejected", () => {
    expect(statusAfterVerification("pending_verification", "rejected")).toBe("rejected");
  });

  test("under review moves an invited resident into the queue and leaves others alone", () => {
    expect(statusAfterVerification("invited", "under_review")).toBe(
      "pending_verification",
    );
    expect(statusAfterVerification("active", "pending")).toBe("active");
    expect(statusAfterVerification("suspended", "under_review")).toBe("suspended");
  });
});

describe("toMysqlDateTime", () => {
  test("formats a date as a MySQL DATETIME literal", () => {
    expect(toMysqlDateTime("2025-06-15T10:30:00.000Z")).toBe("2025-06-15 10:30:00.000");
  });

  test("accepts a Date and defaults to now", () => {
    expect(toMysqlDateTime(new Date("2023-01-01T00:00:00Z"))).toBe(
      "2023-01-01 00:00:00.000",
    );
    expect(toMysqlDateTime()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(toMysqlDateTime(null)).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test("rejects an unparseable date with 400", () => {
    let thrown: unknown;
    try {
      toMysqlDateTime("not-a-date");
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(AppError);
    expect((thrown as AppError).status).toBe(400);
    expect((thrown as AppError).code).toBe("invalid_date");
  });
});
