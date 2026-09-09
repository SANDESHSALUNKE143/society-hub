import { describe, expect, it } from "vitest";
import { App } from "./App";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SocietiesPage } from "./pages/SocietiesPage";
import { SocietyDetailPage } from "./pages/SocietyDetailPage";
import { ComingSoonPage } from "./pages/ComingSoonPage";
import { MANAGE_NAV } from "./manage-nav";

describe("manage smoke unit", () => {
  it("placeholder passes", () => {
    expect(true).toBe(true);
  });

  it("App and primary Manage pages import without throwing", () => {
    for (const component of [
      App,
      Shell,
      LoginPage,
      DashboardPage,
      SocietiesPage,
      SocietyDetailPage,
      ComingSoonPage,
    ]) {
      expect(typeof component).toBe("function");
    }
  });

  it("nav exposes live Users and Coming soon subscriptions", () => {
    expect(MANAGE_NAV.some((n) => n.to === "/users" && n.status === "live")).toBe(true);
    expect(MANAGE_NAV.some((n) => n.to === "/subscriptions" && n.status === "soon")).toBe(true);
  });
});
