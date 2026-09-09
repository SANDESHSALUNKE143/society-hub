describe("Client App staff (Admin mode) navigation", () => {
  beforeEach(() => {
    // Any list endpoint we haven't explicitly mocked should degrade gracefully to empty.
    cy.intercept("GET", "**/v1/**", { statusCode: 200, body: [] });
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/complaints*", {
      statusCode: 200,
      body: { items: [], page: 1, limit: 20, total: 0 },
    });
    cy.intercept("GET", "**/v1/bills*", {
      statusCode: 200,
      body: { items: [], page: 1, limit: 20, total: 0 },
    });
    cy.intercept("GET", "**/v1/payments*", {
      statusCode: 200,
      body: { items: [], page: 1, limit: 20, total: 0 },
    });
    cy.intercept("GET", "**/v1/dashboard/stats*", {
      statusCode: 200,
      body: {
        openComplaints: 2,
        totalComplaints: 10,
        duesOutstandingPaise: 150000,
        upcomingBookings: 1,
        publishedNotices: 3,
        unreadNotifications: 4,
      },
    });
  });

  it("shows the Admin | Resident toggle defaulted to Admin, with the Admin nav", () => {
    cy.visit("/dashboard");
    cy.get('[data-testid="app-mode-toggle"]').should("be.visible");
    cy.get('[data-testid="app-mode-admin"]').should("have.class", "bg-white");

    cy.get('nav a[href="/residents"]').should("be.visible");
    cy.get('nav a[href="/onboard"]').should("be.visible");
    cy.get('nav a[href="/invites"]').scrollIntoView().should("be.visible");
    cy.get('nav a[href="/flats"]').scrollIntoView().should("be.visible");
    cy.get('nav a[href="/team"]').scrollIntoView().should("be.visible");
    cy.get('nav a[href="/audit"]').scrollIntoView().should("exist");

    cy.get('nav a[href="/bills"]').scrollIntoView().click({ force: true });
    cy.url().should("include", "/bills");
    cy.get('[data-testid="bills-generate-toggle"]').should("be.visible");
  });

  it("switches to Resident mode and keeps the resident nav (no Admin force-back)", () => {
    cy.visit("/dashboard");
    cy.get('[data-testid="app-mode-resident"]').click();
    cy.get('[data-testid="app-mode-resident"]').should("have.class", "bg-white");
    cy.get('[data-testid="app-mode-admin"]').should("not.have.class", "bg-white");

    cy.get('nav a[href="/onboard"]').should("not.exist");
    cy.get('nav a[href="/residents"]').should("not.exist");
    cy.get('nav a[href="/flats"]').should("not.exist");
    cy.contains('nav a[href="/complaints"]', "My complaints").should("be.visible");

    cy.reload();
    cy.get('[data-testid="app-mode-resident"]').should("have.class", "bg-white");
    cy.contains('nav a[href="/complaints"]', "My complaints").should("be.visible");
  });
});
