import { describe, expect, it } from "vitest";
import { App } from "./App";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SocietiesPage } from "./pages/SocietiesPage";
import { parseSocietyTab, SocietyDetailPage } from "./pages/SocietyDetailPage";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { SocietyFlatsPanel } from "./components/SocietyFlatsPanel";
import { SocietyParkingsPanel } from "./components/SocietyParkingsPanel";
import { SocietyStructurePanel } from "./components/SocietyStructurePanel";
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
      SocietyStructurePanel,
      SocietyFlatsPanel,
      SocietyParkingsPanel,
      ConfirmDialog,
      ComingSoonPage,
    ]) {
      expect(typeof component).toBe("function");
    }
  });

  it("nav exposes live Users and live subscriptions", () => {
    expect(MANAGE_NAV.some((n) => n.to === "/users" && n.status === "live")).toBe(true);
    expect(MANAGE_NAV.some((n) => n.to === "/subscriptions" && n.status === "live")).toBe(true);
  });

  it("defaults society detail tab to structure", () => {
    expect(parseSocietyTab(null)).toBe("structure");
    expect(parseSocietyTab("parkings")).toBe("parkings");
    expect(parseSocietyTab("flats")).toBe("flats");
    expect(parseSocietyTab("team")).toBe("team");
    expect(parseSocietyTab("controls")).toBe("controls");
    expect(parseSocietyTab("nope")).toBe("structure");
  });
});
