import { describe, expect, it } from "vitest";
import { MANAGE_NAV, manageNavByPath, SOCIETY_COMING_SOON } from "./manage-nav";

describe("manage-nav", () => {
  it("marks core and commercial routes live", () => {
    const live = MANAGE_NAV.filter((n) => n.status === "live").map((n) => n.to);
    expect(live).toContain("/dashboard");
    expect(live).toContain("/societies");
    expect(live).toContain("/users");
    expect(live).toContain("/audit");
    expect(live).toContain("/feature-flags");
    expect(live).toContain("/society-settings");
    expect(live).toContain("/subscriptions");
    expect(live).toContain("/discounts");
    expect(live).toContain("/bills");
    expect(live).toContain("/payments");
    expect(live).toContain("/announcements");
    expect(live).toContain("/integrations");
    expect(live).toContain("/support");
  });

  it("has no coming-soon nav items in the demo commercial layer", () => {
    const soon = MANAGE_NAV.filter((n) => n.status === "soon");
    expect(soon).toEqual([]);
  });

  it("manageNavByPath resolves feature-flag blurbs", () => {
    const flags = manageNavByPath("/feature-flags");
    expect(flags?.status).toBe("live");
    expect(flags?.blurb.length).toBeGreaterThan(20);
  });

  it("society detail still documents future usage metering", () => {
    expect(SOCIETY_COMING_SOON.some((r) => /usage/i.test(r.title))).toBe(true);
  });
});
