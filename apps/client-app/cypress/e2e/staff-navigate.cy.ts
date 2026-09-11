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
    cy.get('nav a[href="/onboard"]').should("not.exist");
    cy.get('nav a[href="/invites"]').should("not.exist");
    cy.get('nav a[href="/flats"]').scrollIntoView().should("be.visible");
    cy.get('nav a[href="/team"]').scrollIntoView().should("be.visible");
    cy.get('nav a[href="/audit"]').scrollIntoView().should("exist");
    cy.contains('nav a[href="/complaints"]', "Complaints").scrollIntoView().should("be.visible");

    cy.get('nav a[href="/bills"]').scrollIntoView().click({ force: true });
    cy.url().should("include", "/bills");
    cy.get('[data-testid="bills-generate-toggle"]').should("be.visible").click();
    cy.get('[data-testid="bills-generate-form"]').should("be.visible");
    cy.get('[data-testid="bills-generate-period"]').should("exist");
    cy.get('[data-testid="bills-generate-reason"]').should("exist");
    cy.get('[data-testid="bills-generate-close"]').click();
    cy.get('[data-testid="bills-generate-form"]').should("not.exist");
  });

  it("opens bill detail from the staff list", () => {
    const billId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    cy.intercept("GET", "**/v1/bills?*", {
      statusCode: 200,
      body: {
        items: [
          {
            id: billId,
            flatId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            flatNumber: "101",
            periodYm: "2026-09",
            amountPaise: 250000,
            status: "issued",
            notes: "Maintenance",
            createdAt: "2026-09-01T10:00:00.000Z",
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
      },
    }).as("listBills");
    cy.intercept("GET", `**/v1/bills/${billId}`, {
      statusCode: 200,
      body: {
        id: billId,
        flatId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        flatNumber: "101",
        periodYm: "2026-09",
        amountPaise: 250000,
        status: "issued",
        notes: "Maintenance",
        createdAt: "2026-09-01T10:00:00.000Z",
        lineItems: [
          { id: "li-1", label: "Maintenance 2026-09", amountPaise: 250000 },
        ],
        payments: [],
        owner: {
          userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          name: "Demo Owner",
          phone: "8888888888",
          email: "owner@example.com",
          residentType: "owner",
          isPrimary: true,
        },
        occupants: [],
      },
    }).as("getBill");
    cy.intercept("POST", `**/v1/bills/${billId}/notify`, {
      statusCode: 200,
      body: { ok: true, notified: 1 },
    }).as("notifyBill");

    cy.visit("/bills");
    cy.wait("@listBills");
    cy.get('[data-testid="bills-row"]').first().click();
    cy.wait("@getBill");
    cy.get('[data-testid="bills-detail-dialog"]').should("be.visible");
    cy.get('[data-testid="bills-detail-owner"]').should("contain", "Demo Owner");
    cy.get('[data-testid="bills-detail-owner"]').should("contain", "8888888888");
    cy.get('[data-testid="bills-detail-owner"]').should("contain", "owner@example.com");
    cy.get('[data-testid="bills-detail-lines"]').should("contain", "Maintenance 2026-09");
    cy.get('[data-testid="bills-detail-no-payments"]').should("be.visible");
    cy.get('[data-testid="bills-detail-notify"]').click();
    cy.wait("@notifyBill");
    cy.contains("Notified 1 resident").should("be.visible");
    cy.get('[data-testid="bills-detail-void"]').should("be.visible");
    cy.get('[data-testid="bills-detail-close"]').click();
    cy.get('[data-testid="bills-detail-dialog"]').should("not.exist");
  });

  it("switches to Resident mode and keeps the resident nav (no Admin force-back)", () => {
    cy.visit("/dashboard");
    cy.get('[data-testid="app-mode-resident"]').click();
    cy.get('[data-testid="app-mode-resident"]').should("have.class", "bg-white");
    cy.get('[data-testid="app-mode-admin"]').should("not.have.class", "bg-white");

    cy.get('nav a[href="/onboard"]').should("not.exist");
    cy.get('nav a[href="/residents"]').should("not.exist");
    cy.get('nav a[href="/flats"]').should("not.exist");
    cy.contains('nav a[href="/complaints"]', "Complaints").should("be.visible");

    cy.reload();
    cy.get('[data-testid="app-mode-resident"]').should("have.class", "bg-white");
    cy.contains('nav a[href="/complaints"]', "Complaints").should("be.visible");
  });

  it("opens Team with add and edit controls", () => {
    cy.intercept("GET", "**/v1/team", {
      statusCode: 200,
      body: [
        {
          userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          name: "Society Admin",
          email: "admin@keshav.local",
          phone: "9999999999",
          role: "chairperson",
        },
        {
          userId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          name: "Committee",
          email: "ops@example.com",
          phone: null,
          role: "committee",
        },
      ],
    }).as("team");

    cy.visit("/team");
    cy.wait("@team");
    cy.get('[data-testid="team-page"]').should("be.visible");
    cy.get('[data-testid="add-team-form"]').should("be.visible");
    cy.get('[data-testid="add-team-phone"]').should("be.visible");
    cy.get('[data-testid="team-table"]').should("be.visible");
    cy.get('[data-testid="team-edit-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]').click();
    cy.get('[data-testid="edit-team-form"]').should("be.visible");
    cy.get('[data-testid="edit-team-phone"]').should("be.visible");
    cy.get('[data-testid="team-remove-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]').should(
      "be.visible",
    );
  });

  it("opens Residents with the onboarded list", () => {
    cy.intercept("GET", "**/v1/admin/residents*", {
      statusCode: 200,
      body: {
        items: [
          {
            id: "res-1",
            userId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
            name: "Demo Resident",
            email: "resident@example.com",
            phone: "8888888888",
            residentType: "owner",
            isPrimary: true,
            status: "active",
            verificationStatus: "approved",
            moveInDate: "2025-01-01",
            moveOutDate: null,
            flat: {
              id: "flat-1",
              number: "101",
              wingName: "A",
              buildingName: null,
            },
            createdAt: "2025-01-01",
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
      },
    }).as("residents");

    cy.visit("/residents");
    cy.wait("@residents");
    cy.get('[data-testid="residents-page"]').should("be.visible");
    cy.get('[data-testid="residents-table"]').should("be.visible");
    cy.contains("td", "Demo Resident").should("be.visible");
    cy.contains("td", "A-101").should("be.visible");
    cy.get('[data-testid="residents-add"]').should("be.visible").and("contain", "Add resident");
    cy.get('[data-testid="residents-tabs"]').should("be.visible");
    cy.get('[data-testid="residents-add"]').click();
    cy.get('[data-testid="residents-add-dialog"]').should("be.visible");
    cy.get('[data-testid="onboard-form"]').should("be.visible");
    cy.get('[data-testid="onboard-notify"]').should("be.visible");
    cy.get('[data-testid="residents-add-close"]').click();
    cy.get('[data-testid="residents-add-dialog"]').should("not.exist");
  });
});
