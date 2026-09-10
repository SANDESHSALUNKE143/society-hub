import { describe, expect, test } from "bun:test";
import { canUseManageApp } from "./manage-access";

describe("canUseManageApp", () => {
  test("allows platform superadmin and society admin", () => {
    expect(canUseManageApp("superadmin")).toBe(true);
    expect(canUseManageApp("chairperson")).toBe(true);
    expect(canUseManageApp("admin")).toBe(true);
  });

  test("rejects residents and other society staff", () => {
    expect(canUseManageApp("resident")).toBe(false);
    expect(canUseManageApp("secretary")).toBe(false);
    expect(canUseManageApp(undefined)).toBe(false);
  });
});
