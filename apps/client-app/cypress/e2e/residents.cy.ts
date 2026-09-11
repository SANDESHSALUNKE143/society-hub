/**
 * Admin resident management — directory, detail and the two critical flows:
 * verification (invite → pending → verified) and move-out (membership becomes
 * inactive while history survives).
 */

const TENANT = "22222222-2222-2222-2222-222222222222";

const flat = {
  id: "flat-1",
  number: "1204",
  wingId: "wing-1",
  wingName: "A",
  buildingId: "bld-1",
  buildingName: "Tower A",
  floor: 12,
  parkingSlot: "P-1204",
};

function resident(overrides: Record<string, unknown> = {}) {
  return {
    id: "res-1",
    userId: "user-1",
    name: "Rohan Vichare",
    phone: "9800000001",
    email: "rohan@example.com",
    residentType: "owner",
    isPrimary: true,
    status: "pending_verification",
    verificationStatus: "pending",
    moveInDate: "2025-06-15 00:00:00.000",
    moveOutDate: null,
    flat,
    createdAt: "2025-06-15 00:00:00.000",
    ...overrides,
  };
}

function residentDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...resident(overrides),
    societyName: "Keshav Heights",
    remarks: null,
    moveOutReason: null,
    rejectionReason: null,
    verifiedAt: null,
    verifiedByName: null,
    roles: ["resident"],
    emergencyContactName: "Sayali Vichare",
    emergencyContactRelation: "Spouse",
    emergencyContactPhone: "9800000009",
    vehicleNumber: "MH12AB1234",
    communicationPreferences: {
      inApp: true,
      push: true,
      email: true,
      whatsapp: false,
      sms: false,
    },
    family: [],
    documents: [],
    vehicles: [],
    otherMemberships: [],
    ...overrides,
  };
}

function stubDirectory(items: ReturnType<typeof resident>[]) {
  cy.intercept("GET", "**/v1/admin/residents?*", {
    statusCode: 200,
    body: { items, page: 1, limit: 20, total: items.length },
  }).as("residents");
  cy.intercept("GET", "**/v1/societies/*/buildings", {
    statusCode: 200,
    body: [{ id: "bld-1", name: "Tower A" }],
  }).as("buildings");
}

describe("Admin resident directory", () => {
  beforeEach(() => {
    cy.loginAsStaff();
  });

  it("lists residents with their flat, type, status and verification", () => {
    stubDirectory([resident(), resident({ id: "res-2", name: "Sayali Vichare", residentType: "tenant" })]);
    cy.visit("/residents");
    cy.wait("@residents");

    cy.contains("h1", "Residents").should("be.visible");
    cy.get('[data-testid="residents-table"]').should("be.visible");
    cy.contains("Rohan Vichare").should("be.visible");
    cy.contains("A-1204").should("be.visible");
    cy.contains("Pending verification").should("be.visible");
    cy.get('[data-testid="residents-pagination-summary"]').should("contain", "of 2");
  });

  it("shows an empty state when no resident matches", () => {
    stubDirectory([]);
    cy.visit("/residents");
    cy.wait("@residents");
    cy.get('[data-testid="table-empty"]').should("be.visible");
  });

  it("shows an error state with a retry when the API fails", () => {
    cy.intercept("GET", "**/v1/admin/residents?*", { statusCode: 500, body: {} }).as(
      "residentsFail",
    );
    cy.intercept("GET", "**/v1/societies/*/buildings", { statusCode: 200, body: [] });
    cy.visit("/residents");
    cy.wait("@residentsFail");
    cy.get('[data-testid="table-error"]').should("be.visible");
    cy.contains("button", "Try again").should("be.visible");
  });

  it("pushes search and filters into the request rather than filtering in React", () => {
    stubDirectory([resident()]);
    cy.visit("/residents");
    cy.wait("@residents");

    cy.get('[data-testid="residents-search"]').type("rohan{enter}");
    cy.wait("@residents").its("request.url").should("include", "search=rohan");

    cy.get('[data-testid="residents-filter-type"]').select("Tenant");
    cy.wait("@residents").its("request.url").should("include", "residentType=tenant");

    cy.get('[data-testid="residents-filter-status"]').select("Moved out");
    cy.wait("@residents").its("request.url").should("include", "status=moved_out");

    cy.get('[data-testid="sort-flat"]').click();
    cy.wait("@residents").its("request.url").should("include", "sort=flat");
  });
});

describe("Resident verification flow", () => {
  beforeEach(() => {
    cy.loginAsStaff();
  });

  it("an admin approves a pending resident and the status updates", () => {
    cy.intercept("GET", "**/v1/admin/residents/res-1", {
      statusCode: 200,
      body: residentDetail(),
    }).as("detail");

    cy.visit("/residents/res-1");
    cy.wait("@detail");

    cy.get('[data-testid="resident-status"]').should("contain", "Pending verification");
    cy.get('[data-testid="resident-verification"]').should("contain", "Pending");

    cy.intercept("POST", "**/v1/admin/residents/res-1/verify", {
      statusCode: 200,
      body: residentDetail({
        status: "active",
        verificationStatus: "approved",
        verifiedAt: "2025-06-20 00:00:00.000",
        verifiedByName: "Rekha Iyer",
      }),
    }).as("verify");

    cy.get('[data-testid="resident-verify"]').click();
    // Sensitive actions must confirm first.
    cy.get('[data-testid="confirm-dialog"]').should("be.visible");
    cy.get('[data-testid="confirm-dialog-confirm"]').click();

    cy.wait("@verify");
    cy.get('[data-testid="resident-verification"]').should("contain", "Approved");
    cy.get('[data-testid="resident-status"]').should("contain", "Active");
    cy.get('[data-testid="resident-message"]').should("contain", "approved");
  });

  it("rejection requires a reason and surfaces it back to the admin", () => {
    cy.intercept("GET", "**/v1/admin/residents/res-1", {
      statusCode: 200,
      body: residentDetail(),
    }).as("detail");
    cy.visit("/residents/res-1");
    cy.wait("@detail");

    cy.get('[data-testid="resident-reject"]').click();
    cy.get('[data-testid="confirm-dialog-confirm"]').should("be.disabled");

    cy.intercept("POST", "**/v1/admin/residents/res-1/reject", {
      statusCode: 200,
      body: residentDetail({
        status: "rejected",
        verificationStatus: "rejected",
        rejectionReason: "Please upload a valid tenant agreement.",
      }),
    }).as("reject");

    cy.get('[data-testid="confirm-dialog-reason"]').type(
      "Please upload a valid tenant agreement.",
    );
    cy.get('[data-testid="confirm-dialog-confirm"]').click();
    cy.wait("@reject");

    cy.get('[data-testid="resident-verification"]').should("contain", "Rejected");
    cy.get('[data-testid="resident-rejection-reason"]').should(
      "contain",
      "Please upload a valid tenant agreement.",
    );
  });
});

describe("Move-out flow", () => {
  beforeEach(() => {
    cy.loginAsStaff();
  });

  it("closes the membership and keeps the historical record", () => {
    cy.intercept("GET", "**/v1/admin/residents/res-1", {
      statusCode: 200,
      body: residentDetail({ status: "active", verificationStatus: "approved" }),
    }).as("detail");
    cy.visit("/residents/res-1");
    cy.wait("@detail");

    cy.intercept("POST", "**/v1/admin/residents/res-1/move-out", {
      statusCode: 200,
      body: residentDetail({
        status: "moved_out",
        verificationStatus: "approved",
        moveOutDate: "2025-05-31 00:00:00.000",
        moveOutReason: "Relocated to Pune",
      }),
    }).as("moveOut");

    cy.get('[data-testid="resident-move-out"]').click();
    cy.get('[data-testid="confirm-dialog"]').should("contain", "historical record is kept");
    cy.get('[data-testid="confirm-dialog-reason"]').type("Relocated to Pune");
    cy.get('[data-testid="confirm-dialog-confirm"]').click();
    cy.wait("@moveOut");

    cy.get('[data-testid="resident-status"]').should("contain", "Moved out");
    cy.get('[data-testid="resident-move-out-date"]').should("contain", "2025-05-31");
    // Move-out is no longer offered once the period is closed.
    cy.get('[data-testid="resident-move-out"]').should("not.exist");

    // The record itself is still readable — nothing was destroyed.
    cy.get('[data-testid="resident-tabs-history"]').click();
    cy.get('[data-testid="resident-history"]').should("contain", "2025-05-31");
  });
});

describe("Flat occupancy", () => {
  beforeEach(() => {
    cy.loginAsStaff();
  });

  it("shows owners, tenants, occupants and history for a flat", () => {
    cy.intercept("GET", "**/v1/admin/flats/flat-1", {
      statusCode: 200,
      body: {
        ...flat,
        details: null,
        occupancyStatus: "tenant_occupied",
        primaryOwner: {
          residentId: "res-1",
          userId: "user-1",
          name: "Rohan Vichare",
          phone: "9800000001",
          email: "rohan@example.com",
          residentType: "owner",
          isPrimary: true,
          status: "active",
          verificationStatus: "approved",
          moveInDate: "2025-06-15 00:00:00.000",
          moveOutDate: null,
          familyCount: 1,
        },
        coOwners: [],
        tenants: [
          {
            residentId: "res-2",
            userId: "user-2",
            name: "Sayali Vichare",
            phone: "9800000002",
            email: null,
            residentType: "tenant",
            isPrimary: true,
            status: "active",
            verificationStatus: "approved",
            moveInDate: "2025-07-01 00:00:00.000",
            moveOutDate: null,
            familyCount: 0,
          },
        ],
        currentOccupants: [],
        vehicles: [{ id: "p1", slotNumber: "P-1204", vehicleNumber: "MH12AB1234", type: "car" }],
        documentCount: 3,
      },
    }).as("flat");

    cy.visit("/flats/flat-1");
    cy.wait("@flat");

    cy.contains("h1", "Flat A-1204").should("be.visible");
    cy.get('[data-testid="flat-occupancy-status"]').should("contain", "Tenant occupied");
    cy.get('[data-testid="flat-primary-owner"]').should("contain", "Rohan Vichare");
    cy.get('[data-testid="flat-tenants"]').should("contain", "Sayali Vichare");

    cy.intercept("GET", "**/v1/admin/flats/flat-1/history", {
      statusCode: 200,
      body: [
        {
          residentId: "res-2",
          userId: "user-2",
          name: "Sayali Vichare",
          residentType: "tenant",
          status: "active",
          moveInDate: "2025-06-15 00:00:00.000",
          moveOutDate: null,
          moveOutReason: null,
          isCurrent: true,
        },
        {
          residentId: "res-0",
          userId: "user-0",
          name: "Previous Tenant",
          residentType: "tenant",
          status: "moved_out",
          moveInDate: "2023-01-01 00:00:00.000",
          moveOutDate: "2025-05-31 00:00:00.000",
          moveOutReason: "Lease ended",
          isCurrent: false,
        },
      ],
    }).as("history");

    cy.get('[data-testid="flat-tabs-history"]').click();
    cy.wait("@history");
    cy.get('[data-testid="flat-history"]').should("contain", "2023-01-01 → 2025-05-31");
    cy.get('[data-testid="flat-history"]').should("contain", "Previous Tenant");
    cy.get('[data-testid="flat-history"]').should("contain", "Lease ended");
  });
});

describe("Resident self-service", () => {
  it("shows the resident their verification status and rejection reason", () => {
    cy.loginAsResident();
    cy.intercept("GET", "**/v1/profile", {
      statusCode: 200,
      body: {
        userId: "user-1",
        name: "Asha Rao",
        phone: "8888888888",
        email: null,
        emergencyContact: null,
        emergencyContactName: null,
        emergencyContactRelation: null,
        emergencyContactPhone: null,
        vehicleNumber: null,
        communicationPreferences: {
          inApp: true,
          push: true,
          email: true,
          whatsapp: false,
          sms: false,
        },
        societyName: "Keshav Heights",
        membership: {
          id: "res-9",
          residentType: "tenant",
          isPrimary: true,
          status: "rejected",
          verificationStatus: "rejected",
          rejectionReason: "Please upload a valid tenant agreement.",
          moveInDate: "2025-06-15 00:00:00.000",
          moveOutDate: null,
        },
        family: [],
        documents: [],
        flat: {
          id: "flat-1",
          number: "101",
          wingName: "A",
          buildingName: "Tower A",
          floor: 1,
          parkingSlot: "P-101",
          isOwner: false,
        },
      },
    }).as("profile");

    cy.visit("/account");
    cy.wait("@profile");

    cy.get('[data-testid="account-verification-status"]').should("contain", "Rejected");
    cy.get('[data-testid="account-rejection-reason"]').should(
      "contain",
      "Please upload a valid tenant agreement.",
    );
  });
});

describe("Occupancy dashboard", () => {
  it("surfaces occupancy metrics for admins and hides them in Resident mode", () => {
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/dashboard/stats*", (req) => {
      const mine = req.url.includes("mine=1");
      req.reply({
        statusCode: 200,
        body: {
          openComplaints: 2,
          totalComplaints: 5,
          duesOutstandingPaise: 125000,
          upcomingBookings: 1,
          publishedNotices: 3,
          unreadNotifications: 0,
          occupancy: mine
            ? null
            : {
                totalFlats: 120,
                occupiedFlats: 104,
                vacantFlats: 16,
                ownerOccupiedFlats: 72,
                tenantOccupiedFlats: 32,
                totalResidents: 260,
                activeResidents: 241,
                pendingVerification: 12,
                pendingInvitations: 7,
                movedOut: 19,
              },
        },
      });
    }).as("stats");
    cy.intercept("GET", "**/v1/complaints*", {
      statusCode: 200,
      body: { items: [], page: 1, limit: 4, total: 0 },
    });

    cy.visit(`/dashboard?tenant=${TENANT}`);
    cy.wait("@stats");

    cy.get('[data-testid="dashboard-occupancy"]').should("be.visible");
    cy.get('[data-testid="occupancy-total-flats"]').should("contain", "120");
    cy.get('[data-testid="occupancy-vacant"]').should("contain", "16");
    cy.get('[data-testid="occupancy-tenant-occupied"]').should("contain", "32");
    cy.get('[data-testid="occupancy-pending-verification"]').should("contain", "12");

    // Resident mode is about the household, not the society roll-up.
    cy.get('[data-testid="app-mode-resident"]').click();
    cy.wait("@stats");
    cy.get('[data-testid="dashboard-occupancy"]').should("not.exist");
  });
});
