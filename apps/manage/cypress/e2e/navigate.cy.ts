describe("Manage sidebar navigation", () => {
  beforeEach(() => {
    // Any list endpoint we haven't explicitly mocked should degrade gracefully to empty.
    // Registered first so more specific intercepts below (and inside loginAsAdmin) take
    // priority — Cypress resolves overlapping intercepts last-registered-first.
    cy.intercept("GET", "**/v1/**", { statusCode: 200, body: [] });
    cy.loginAsAdmin();
    cy.intercept("GET", "**/v1/societies", {
      statusCode: 200,
      body: [
        {
          id: "22222222-2222-2222-2222-222222222222",
          name: "Keshav Heights",
          address: null,
          city: "Pune",
          pincode: "411001",
          chairpersonName: "Rekha Iyer",
          chairpersonEmail: "rekha@example.com",
          chairpersonPhone: "9000000000",
          timezone: "Asia/Kolkata",
          createdAt: new Date().toISOString(),
        },
      ],
    }).as("societies");
  });

  it("lands on dashboard with important actions and roadmap", () => {
    cy.visit("/dashboard");
    cy.wait("@societies");
    cy.get('[data-testid="manage-dashboard"]').should("be.visible");
    cy.get('[data-testid="dashboard-kpi-societies"]').should("be.visible");
    cy.contains("Platform roadmap").should("be.visible");
    cy.get('[data-testid="roadmap-users"]').should("be.visible");
  });

    it("lists societies and opens a society detail with the team and planned controls", () => {
    cy.intercept("GET", "**/v1/manage/societies/*/team", {
      statusCode: 200,
      body: [
        {
          userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          name: "Rekha Iyer",
          email: "rekha@example.com",
          phone: "9000000000",
          role: "chairperson",
        },
      ],
    }).as("societyTeam");
    cy.intercept("GET", "**/v1/manage/societies/*/flats", {
      statusCode: 200,
      body: [],
    }).as("societyFlats");

    cy.visit("/societies");
    cy.wait("@societies");
    cy.contains("h1", "Societies").should("be.visible");
    cy.contains("Keshav Heights").click();

    cy.url().should("include", "/societies/22222222-2222-2222-2222-222222222222");
    cy.wait("@societyTeam");
    cy.get('[data-testid="society-tabs"]').should("be.visible");
    cy.get('[data-testid="society-tab-team"]').should("have.attr", "aria-selected", "true");
    cy.contains("h2", "Society team").should("be.visible");
    cy.get('[data-testid="team-table"]').should("be.visible");
    cy.get('[data-testid="team-table"]').contains("Rekha Iyer");
    cy.get('[data-testid="add-team-open"]').should("be.visible");
    cy.get('[data-testid="add-team-form"]').should("not.exist");
    cy.get('[data-testid="add-team-open"]').click();
    cy.get('[data-testid="add-team-dialog"]').should("be.visible");
    cy.get('[data-testid="add-team-form"]').should("be.visible");
    cy.get('[data-testid="add-team-phone"]').should("be.visible");
    cy.get('[data-testid="add-team-dialog-close"]').click();
    cy.get('[data-testid="society-flats"]').should("not.exist");

    cy.get('[data-testid="society-tab-flats"]').click();
    cy.wait("@societyFlats");
    cy.get('[data-testid="society-flats"]').should("be.visible");
    cy.get('[data-testid="add-flat-open"]').should("be.visible");
    cy.get('[data-testid="add-flat-form"]').should("not.exist");
    cy.get('[data-testid="add-flat-open"]').click();
    cy.get('[data-testid="add-flat-dialog"]').should("be.visible");
    cy.get('[data-testid="add-flat-dialog-close"]').click();

    cy.intercept("GET", "**/v1/manage/societies/*/parkings", {
      statusCode: 200,
      body: [],
    }).as("societyParkings");
    cy.get('[data-testid="society-tab-parkings"]').click();
    cy.wait("@societyParkings");
    cy.url().should("include", "tab=parkings");
    cy.get('[data-testid="society-parkings"]').should("be.visible");
    cy.get('[data-testid="add-parking-open"]').should("be.visible");

    cy.get('[data-testid="society-tab-controls"]').click();
    cy.url().should("include", "tab=controls");
    cy.get('[data-testid="society-planned-controls"]').should("be.visible");
  });

  it("adds a flat from the society detail form", () => {
    cy.intercept("GET", "**/v1/manage/societies/*/team", { statusCode: 200, body: [] });
    cy.intercept("GET", "**/v1/manage/societies/*/flats", {
      statusCode: 200,
      body: [],
    }).as("societyFlats");
    cy.intercept("POST", "**/v1/manage/societies/*/flats", {
      statusCode: 200,
      body: {
        id: "flat-new",
        number: "101",
        wingName: "A",
        floor: 3,
      },
    }).as("addFlat");

    cy.visit("/societies/22222222-2222-2222-2222-222222222222");
    cy.get('[data-testid="society-tab-flats"]').click();
    cy.wait("@societyFlats");
    cy.get('[data-testid="add-flat-open"]').click();
    cy.get('[data-testid="add-flat-dialog"]').should("be.visible");
    cy.get('[data-testid="add-flat-wing"]').type("A");
    cy.get('[data-testid="add-flat-floor"]').type("3");
    cy.get('[data-testid="add-flat-number"]').type("101");
    cy.get('[data-testid="add-flat-submit"]').click();
    cy.wait("@addFlat");
    cy.get('[data-testid="add-flat-dialog"]').should("not.exist");
    cy.contains("Flat added").should("be.visible");
  });

  it("adds puzzle parking from the society detail form", () => {
    cy.intercept("GET", "**/v1/manage/societies/*/team", { statusCode: 200, body: [] });
    cy.intercept("GET", "**/v1/manage/societies/*/parkings", {
      statusCode: 200,
      body: [],
    }).as("societyParkings");
    cy.intercept("POST", "**/v1/manage/societies/*/parkings", {
      statusCode: 200,
      body: {
        id: "park-new",
        slotNumber: "101",
        kind: "puzzle",
        wing: "A",
        floor: null,
        flatId: null,
        flatNumber: null,
        vehicleNumber: null,
        type: "car",
        createdAt: new Date().toISOString(),
      },
    }).as("addParking");

    cy.visit("/societies/22222222-2222-2222-2222-222222222222?tab=parkings");
    cy.wait("@societyParkings");
    cy.get('[data-testid="add-parking-open"]').click();
    cy.get('[data-testid="add-parking-dialog"]').should("be.visible");
    cy.get('[data-testid="add-parking-kind"]').select("puzzle");
    cy.get('[data-testid="add-parking-wing"]').clear().type("A");
    cy.get('[data-testid="add-parking-number"]').type("101");
    cy.get('[data-testid="add-parking-submit"]').click();
    cy.wait("@addParking");
    cy.get('[data-testid="add-parking-dialog"]').should("not.exist");
    cy.contains("Parking added").should("be.visible");
  });

  it("paginates, edits, and deletes flats on society detail", () => {
    const flats = Array.from({ length: 12 }, (_, i) => ({
      id: `flat-${i + 1}`,
      number: String(101 + i),
      wingName: "A",
      floor: 1,
    }));
    cy.intercept("GET", "**/v1/manage/societies/*/team", { statusCode: 200, body: [] });
    cy.intercept("GET", "**/v1/manage/societies/*/flats", {
      statusCode: 200,
      body: flats,
    }).as("societyFlats");
    cy.intercept("PATCH", "**/v1/manage/societies/*/flats/*", {
      statusCode: 200,
      body: { id: "flat-1", number: "101", wingName: "A", floor: 4 },
    }).as("editFlat");
    cy.intercept("DELETE", "**/v1/manage/societies/*/flats/*", {
      statusCode: 200,
      body: { ok: true },
    }).as("deleteFlat");

    cy.visit("/societies/22222222-2222-2222-2222-222222222222");
    cy.get('[data-testid="society-tab-flats"]').click();
    cy.wait("@societyFlats");
    cy.get('[data-testid="society-flats-table"]').should("be.visible");
    cy.get('[data-testid="society-flats-table"]').contains("th", "No.");
    cy.get('[data-testid="flat-serial"]').first().should("have.text", "1");
    cy.get('[data-testid="flats-pagination"]').should("be.visible");
    cy.get('[data-testid="flats-page-label"]').should("contain", "Page 1 of 2");
    cy.get('[data-testid="flats-page-next"]').click();
    cy.get('[data-testid="flats-page-label"]').should("contain", "Page 2 of 2");
    cy.get('[data-testid="flat-serial"]').first().should("have.text", "11");
    cy.get('[data-testid="flats-page-prev"]').click();

    cy.get('[data-testid="flat-edit-flat-1"]').click();
    cy.get('[data-testid="add-flat-floor"]').clear().type("4");
    cy.get('[data-testid="add-flat-submit"]').click();
    cy.wait("@editFlat");
    cy.contains("Flat updated").should("be.visible");

    cy.get('[data-testid="flat-delete-flat-1"]').click();
    cy.get('[data-testid="delete-flat-dialog"]').should("be.visible");
    cy.contains("Delete flat A-101?").should("be.visible");
    cy.get('[data-testid="delete-flat-dialog-confirm"]').click();
    cy.wait("@deleteFlat");
    cy.get('[data-testid="delete-flat-dialog"]').should("not.exist");
    cy.contains("Flat deleted").should("be.visible");
  });

  it("shows live + coming soon nav items and a Client App link", () => {
    cy.visit("/dashboard");
    cy.wait("@societies");

    cy.get('[data-testid="nav-dashboard"]').should("be.visible");
    cy.get('[data-testid="nav-societies"]').should("be.visible");
    cy.get('[data-testid="nav-users"]').should("be.visible");
    cy.get('[data-testid="nav-subscriptions"]').should("be.visible");
    cy.contains("a", "Open Client App")
      .should("have.attr", "href")
      .and("include", "app.localhost:5173");
  });

  it("opens Users directory from the sidebar", () => {
    cy.intercept("GET", "**/v1/manage/users*", {
      statusCode: 200,
      body: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          name: "Platform Superadmin",
          email: "superadmin@societyhub.local",
          phone: null,
          username: "superadmin",
          memberships: [
            {
              tenantId: "22222222-2222-2222-2222-222222222222",
              societyName: "Keshav Heights",
              role: "superadmin",
            },
          ],
          createdAt: new Date().toISOString(),
          lastActivityAt: new Date().toISOString(),
        },
      ],
    }).as("users");

    cy.visit("/users");
    cy.wait("@users");
    cy.get('[data-testid="manage-users-page"]').should("be.visible");
    cy.contains("Platform Superadmin").should("be.visible");
  });

  it("opens Coming soon screens from the sidebar", () => {
    cy.visit("/subscriptions");
    cy.get('[data-testid="coming-soon-page"]').should("be.visible");
    cy.get('[data-testid="coming-soon-badge"]').should("be.visible");
    cy.contains("h1", "Subscriptions").should("be.visible");
  });

  it("redirects unknown routes to /dashboard", () => {
    cy.visit("/this-does-not-exist");
    cy.url().should("include", "/dashboard");
  });
});
