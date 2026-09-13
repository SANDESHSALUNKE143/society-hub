import { describe, expect, test } from "bun:test";
import { canUseManageApp } from "./manage-access";

describe("canUseManageApp", () => {
  test("allows platform superadmin only", () => {
    expect(canUseManageApp("superadmin")).toBe(true);
  });

  test("rejects society staff and residents", () => {
    expect(canUseManageApp("chairperson")).toBe(false);
    expect(canUseManageApp("admin")).toBe(false);
    expect(canUseManageApp("secretary")).toBe(false);
    expect(canUseManageApp("resident")).toBe(false);
    expect(canUseManageApp(undefined)).toBe(false);
  });
});
