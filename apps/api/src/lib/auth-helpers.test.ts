import { describe, expect, test } from "bun:test";
import {
  canUseAdminMode,
  collapseMembershipsByTenant,
  hashToken,
  isPlatformRole,
  isResidentLikeRole,
  isSocietyStaffRole,
  pickDefaultRole,
  isStaffRole,
  normalizeRole,
  requireAuth,
  requirePlatform,
  requireRole,
  requireSocietyStaff,
} from "./auth-helpers";
import { AppError } from "./errors";
import type { AccessClaims } from "@society-hub/auth";

describe("auth-helpers", () => {
  test("hashToken is sha256 hex", () => {
    expect(hashToken("abc")).toHaveLength(64);
  });

  test("role classifiers", () => {
    expect(isSocietyStaffRole("chairperson")).toBe(true);
    expect(isSocietyStaffRole("admin")).toBe(true);
    expect(isSocietyStaffRole("secretary")).toBe(true);
    expect(isSocietyStaffRole("superadmin")).toBe(false);
    expect(isSocietyStaffRole("resident")).toBe(false);
    expect(isStaffRole("chairperson")).toBe(true);
    expect(isStaffRole("superadmin")).toBe(true);
    expect(isPlatformRole("superadmin")).toBe(true);
    expect(isResidentLikeRole("tenant")).toBe(true);
    expect(canUseAdminMode("treasurer")).toBe(true);
    expect(canUseAdminMode("superadmin")).toBe(true);
    expect(canUseAdminMode("resident")).toBe(false);
    expect(normalizeRole("admin")).toBe("chairperson");
    expect(pickDefaultRole(["chairperson", "superadmin"])).toBe("superadmin");
    expect(pickDefaultRole(["resident", "chairperson"])).toBe("chairperson");
    expect(pickDefaultRole(["committee", "chairperson"])).toBe("chairperson");
    expect(pickDefaultRole(["committee", "admin"])).toBe("chairperson");
    expect(pickDefaultRole(["resident"])).toBe("resident");
    expect(pickDefaultRole([])).toBeUndefined();
  });

  test("collapseMembershipsByTenant keeps one row per society", () => {
    const rows = collapseMembershipsByTenant([
      {
        tenantId: "t1",
        societyName: "Keshav Heights",
        role: "committee" as const,
      },
      {
        tenantId: "t1",
        societyName: "Keshav Heights",
        role: "chairperson" as const,
      },
      {
        tenantId: "t2",
        societyName: "Other Society",
        role: "resident" as const,
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ tenantId: "t1", role: "chairperson" });
    expect(rows[1]).toMatchObject({ tenantId: "t2", role: "resident" });
  });

  test("requireAuth throws when missing", () => {
    expect(() => requireAuth(null)).toThrow(AppError);
  });

  test("requireAuth returns claims", () => {
    const claims: AccessClaims = {
      sub: "u1",
      role: "chairperson",
      tenantId: "t1",
      typ: "access",
    };
    expect(requireAuth(claims).sub).toBe("u1");
  });

  test("requireRole forbids wrong role", () => {
    const claims: AccessClaims = {
      sub: "u1",
      role: "resident",
      tenantId: "t1",
      typ: "access",
    };
    expect(() => requireRole(claims, ["chairperson"])).toThrow(AppError);
  });

  test("requireSocietyStaff and requirePlatform", () => {
    const chair: AccessClaims = {
      sub: "u1",
      role: "chairperson",
      tenantId: "t1",
      typ: "access",
    };
    const platform: AccessClaims = {
      sub: "u2",
      role: "superadmin",
      tenantId: "t1",
      typ: "access",
    };
    expect(() => requireSocietyStaff(chair)).not.toThrow();
    expect(() => requireSocietyStaff(platform)).not.toThrow();
    expect(() => requirePlatform(platform)).not.toThrow();
    expect(() => requirePlatform(chair)).toThrow(AppError);
  });
});
