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

  it("lists societies and opens a society detail with planned controls", () => {
    cy.visit("/societies");
    cy.wait("@societies");
    cy.contains("h1", "Societies").should("be.visible");
    cy.contains("Keshav Heights").click();

    cy.url().should("include", "/societies/22222222-2222-2222-2222-222222222222");
    cy.get('[data-testid="add-team-form"]').should("be.visible");
    cy.get('[data-testid="add-team-phone"]').should("be.visible");
    cy.get('[data-testid="society-planned-controls"]').should("be.visible");
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
