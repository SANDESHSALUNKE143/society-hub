import { describe, expect, test } from "bun:test";
import { AppError } from "../../lib/errors";
import {
  assertCanRemoveTeamMember,
  normalizeStaffRole,
} from "./team-service";

describe("team-service", () => {
  test("normalizeStaffRole maps admin to chairperson", () => {
    expect(normalizeStaffRole("admin")).toBe("chairperson");
    expect(normalizeStaffRole("secretary")).toBe("secretary");
    expect(normalizeStaffRole(undefined)).toBe("chairperson");
  });

  test("assertCanRemoveTeamMember blocks removing yourself", () => {
    expect(() => assertCanRemoveTeamMember("u1", "u1")).toThrow(AppError);
    try {
      assertCanRemoveTeamMember("u1", "u1");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("cannot_remove_self");
      expect((err as AppError).status).toBe(400);
    }
    expect(() => assertCanRemoveTeamMember("u1", "u2")).not.toThrow();
  });
});
