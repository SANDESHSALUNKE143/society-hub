import { describe, expect, test } from "bun:test";
import type { MembershipDto } from "@society-hub/types";
import { uniqueMembershipsBySociety } from "./memberships";

describe("uniqueMembershipsBySociety", () => {
  test("keeps one Keshav Heights row and prefers chairperson", () => {
    const rows: MembershipDto[] = [
      {
        tenantId: "t1",
        societyName: "Keshav Heights",
        role: "committee",
        canUseAdminMode: true,
      },
      {
        tenantId: "t1",
        societyName: "Keshav Heights",
        role: "chairperson",
        canUseAdminMode: true,
      },
      {
        tenantId: "t2",
        societyName: "Other Society",
        role: "resident",
        canUseAdminMode: false,
      },
    ];
    expect(uniqueMembershipsBySociety(rows)).toEqual([
      {
        tenantId: "t1",
        societyName: "Keshav Heights",
        role: "chairperson",
        canUseAdminMode: true,
      },
      {
        tenantId: "t2",
        societyName: "Other Society",
        role: "resident",
        canUseAdminMode: false,
      },
    ]);
  });

  test("skips the picker when only one society has two roles", () => {
    const rows: MembershipDto[] = [
      {
        tenantId: "t1",
        societyName: "Keshav Heights",
        role: "committee",
        canUseAdminMode: true,
      },
      {
        tenantId: "t1",
        societyName: "Keshav Heights",
        role: "chairperson",
        canUseAdminMode: true,
      },
    ];
    expect(uniqueMembershipsBySociety(rows)).toHaveLength(1);
  });
});
