import { describe, expect, it } from "vitest";
import { App } from "./App";
import { Shell } from "./components/Shell";
import { LoginPage } from "./pages/LoginPage";
import { SelectSocietyPage } from "./pages/SelectSocietyPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ComplaintsPage } from "./pages/ComplaintsPage";
import { BillsPage } from "./pages/BillsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { NoticesPage } from "./pages/NoticesPage";
import { LegalPage } from "./pages/LegalPage";
import { TeamPage } from "./pages/TeamPage";
import { ResidentsPage } from "./pages/ResidentsPage";
import { AccountPage } from "./pages/AccountPage";
import { OnboardPage } from "./pages/OnboardPage";

describe("web smoke unit", () => {
  it("placeholder passes", () => {
    expect(true).toBe(true);
  });

  it("App and its routed pages import without throwing", () => {
    for (const component of [
      App,
      Shell,
      LoginPage,
      SelectSocietyPage,
      DashboardPage,
      ComplaintsPage,
      BillsPage,
      PaymentsPage,
      NoticesPage,
      LegalPage,
      TeamPage,
      ResidentsPage,
      AccountPage,
      OnboardPage,
    ]) {
      expect(typeof component).toBe("function");
    }
  });
});
