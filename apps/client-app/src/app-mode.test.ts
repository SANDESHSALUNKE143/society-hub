import { describe, expect, it } from "vitest";
import { canPickComplaintFlat, canUseAdminMode, isPlatformRole } from "./app-mode";

describe("client app-mode", () => {
  it("society staff can use Admin mode", () => {
    expect(canUseAdminMode("chairperson")).toBe(true);
    expect(canUseAdminMode("secretary")).toBe(true);
  });

  it("Manage platform employees can use Admin mode by default", () => {
    expect(isPlatformRole("superadmin")).toBe(true);
    expect(canUseAdminMode("superadmin")).toBe(true);
  });

  it("residents cannot use Admin mode", () => {
    expect(canUseAdminMode("resident")).toBe(false);
    expect(canUseAdminMode("tenant")).toBe(false);
    expect(canUseAdminMode(null)).toBe(false);
  });

  it("documents that staff with Admin capability may also use Resident mode", () => {
    // UI toggle is shown whenever canUseAdminMode is true; Shell no longer
    // forces platform users back to Admin when they pick Resident.
    expect(canUseAdminMode("chairperson")).toBe(true);
    expect(canUseAdminMode("superadmin")).toBe(true);
  });

  it("only Admin mode may pick a society flat when raising a complaint", () => {
    expect(canPickComplaintFlat("resident", "resident")).toBe(false);
    expect(canPickComplaintFlat("resident", "admin")).toBe(false);
    expect(canPickComplaintFlat("chairperson", "resident")).toBe(false);
    expect(canPickComplaintFlat("chairperson", "admin")).toBe(true);
    expect(canPickComplaintFlat("superadmin", "admin")).toBe(true);
  });
});
