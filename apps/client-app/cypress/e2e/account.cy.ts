import { mockResident } from "../support/commands";

function openHousehold() {
  cy.get('[data-testid="account-section-tab-household"]').click();
}

describe("Account flat details", () => {
  it("shows linked flat details for a resident", () => {
    cy.loginAsResident();
    cy.intercept("GET", "**/v1/profile", {
      statusCode: 200,
      body: {
        userId: mockResident.id,
        emergencyContact: "9999999999",
        vehicleNumber: "MH12AB1234",
        societyName: "Keshav Heights",
        flat: {
          id: "flat-1",
          number: "101",
          wingName: "A",
          buildingName: "Tower A",
          floor: 1,
          parkingSlot: "P-101",
          pngGasConnection: true,
          adultCount: 2,
          childCount: 1,
          seniorCitizenCount: 1,
          twoWheelerCount: 0,
          fourWheelerCount: 1,
          isOwner: true,
        },
        vehicles: [],
      },
    }).as("profile");
    cy.intercept("GET", "**/v1/household/members", {
      statusCode: 200,
      body: [],
    }).as("household");
    cy.intercept("GET", "**/v1/parking", {
      statusCode: 200,
      body: [
        {
          id: "p-101",
          slotNumber: "P-101",
          kind: "open",
          flatId: "flat-1",
          flatNumber: "101",
          wing: null,
        },
      ],
    }).as("parkings");

    cy.visit("/account");
    cy.wait("@profile");
    cy.get('[data-testid="account-flat-details"]').should("be.visible");
    cy.get('[data-testid="account-society-name"]').should("contain", "Keshav Heights");
    cy.get('[data-testid="account-flat-number"]').should("contain", "A-101");
    cy.get('[data-testid="account-building-name"]').should("contain", "Tower A");
    cy.get('[data-testid="account-floor"]').should("contain", "1");
    cy.get('[data-testid="account-parking"]').should("contain", "P-101");
    cy.get('[data-testid="account-png"]').should("contain", "Taken");
    cy.get('[data-testid="account-family-counts"]').should("contain", "2 adults");
    cy.get('[data-testid="account-occupancy"]').should("contain", "Owner");
    cy.get('[data-testid="account-section-tabs"]').should("be.visible");
    openHousehold();
    cy.get('[data-testid="account-tabs"]').should("be.visible");
    cy.get('[data-testid="account-tab-owner"]').should("have.attr", "aria-selected", "true");
    cy.get('[data-testid="account-tab-parking"]').click();
    cy.get('[data-testid="account-allotted-parking"]').should("be.visible");
    cy.get('[data-testid="account-parking"]').should("contain", "P-101");
    cy.get('[data-testid="account-tab-gas"]').click();
    cy.get('[data-testid="account-png-yes"]').should("be.checked");
    cy.get('[data-testid="account-tab-family"]').click();
    cy.get('[data-testid="account-adults"]').should("have.value", "2");
    cy.get('[data-testid="account-family-members"]').should("be.visible");
    cy.get('[data-testid="account-family-add"]').click();
    cy.get('[data-testid="account-family-phone"]').should("be.visible");
  });

  it("shows empty state when no flat is linked", () => {
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/profile", {
      statusCode: 200,
      body: {
        userId: "staff-1",
        emergencyContact: null,
        vehicleNumber: null,
        vehicles: [],
        societyName: "Keshav Heights",
        flat: null,
      },
    }).as("profile");

    cy.visit("/account");
    cy.wait("@profile");
    cy.get('[data-testid="account-flat-empty"]').should("be.visible");
    cy.get('[data-testid="account-adults"]').should("not.exist");
    cy.get('[data-testid="account-family-members"]').should("not.exist");
  });

  it("saves household profile fields", () => {
    cy.loginAsResident();
    cy.intercept("GET", "**/v1/profile", {
      statusCode: 200,
      body: {
        userId: mockResident.id,
        emergencyContact: "9999999999",
        vehicleNumber: null,
        societyName: "Keshav Heights",
        flat: {
          id: "flat-1",
          number: "101",
          wingName: "A",
          buildingName: "Tower A",
          floor: 1,
          parkingSlot: "P-101",
          pngGasConnection: false,
          adultCount: 1,
          childCount: 0,
          seniorCitizenCount: 0,
          twoWheelerCount: 0,
          fourWheelerCount: 0,
          isOwner: true,
        },
        vehicles: [],
      },
    }).as("profile");
    cy.intercept("PATCH", "**/v1/auth/profile", {
      statusCode: 200,
      body: {
        userId: mockResident.id,
        emergencyContact: "Trupti",
        vehicleNumber: null,
        societyName: "Keshav Heights",
        flat: {
          id: "flat-1",
          number: "101",
          wingName: "A",
          buildingName: "Tower A",
          floor: 1,
          parkingSlot: "P-101",
          pngGasConnection: true,
          adultCount: 3,
          childCount: 1,
          seniorCitizenCount: 1,
          twoWheelerCount: 0,
          fourWheelerCount: 0,
          isOwner: true,
        },
        vehicles: [],
      },
    }).as("saveProfile");
    cy.intercept("GET", "**/v1/household/members", {
      statusCode: 200,
      body: [],
    }).as("household");

    cy.visit("/account");
    cy.wait("@profile");
    openHousehold();
    cy.get('[data-testid="account-emergency-contact"]').clear().type("Trupti");
    cy.get('[data-testid="account-tab-gas"]').click();
    cy.get('[data-testid="account-png-yes"]').check();
    cy.get('[data-testid="account-tab-family"]').click();
    cy.get('[data-testid="account-adults"]').clear().type("3");
    cy.get('[data-testid="account-children"]').clear().type("1");
    cy.get('[data-testid="account-seniors"]').clear().type("1");
    cy.get('[data-testid="account-profile-form"]').submit();
    cy.wait("@saveProfile");
    cy.contains("Profile updated.");
    cy.get('[data-testid="account-section-tab-flat"]').click();
    cy.get('[data-testid="account-family-counts"]').should("contain", "3 adults");
    cy.get('[data-testid="account-png"]').should("contain", "Taken");
  });

  it("lets the owner add a family member", () => {
    cy.loginAsResident();
    cy.intercept("GET", "**/v1/profile", {
      statusCode: 200,
      body: {
        userId: mockResident.id,
        emergencyContact: null,
        vehicleNumber: null,
        societyName: "Keshav Heights",
        flat: {
          id: "flat-1",
          number: "101",
          wingName: "A",
          buildingName: "Tower A",
          floor: 1,
          parkingSlot: "P-101",
          pngGasConnection: false,
          adultCount: 2,
          childCount: 0,
          seniorCitizenCount: 0,
          twoWheelerCount: 0,
          fourWheelerCount: 0,
          isOwner: true,
        },
        vehicles: [],
      },
    }).as("profile");
    cy.intercept("GET", "**/v1/household/members", {
      statusCode: 200,
      body: [
        {
          userId: mockResident.id,
          name: "Owner",
          email: null,
          phone: "9000000001",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: true,
        },
      ],
    }).as("household");
    cy.intercept("POST", "**/v1/household/members", {
      statusCode: 200,
      body: { user: { name: "Family Kid", phone: "9000000002" } },
    }).as("addFamily");

    cy.visit("/account");
    cy.wait("@profile");
    cy.wait("@household");
    openHousehold();
    cy.get('[data-testid="account-tab-family"]').click();
    cy.get('[data-testid="account-family-table"]').should("contain", "Owner");
    cy.get(`[data-testid="account-family-role-${mockResident.id}"]`).should(
      "contain",
      "Owner",
    );
    cy.get('[data-testid="account-family-empty"]').should("contain", "No family members yet");
    cy.get('[data-testid="account-family-add"]').click();
    cy.get('[data-testid="account-family-name"]').type("Family Kid");
    cy.get('[data-testid="account-family-phone"]').type("9000000002");
    cy.intercept("GET", "**/v1/household/members", {
      statusCode: 200,
      body: [
        {
          userId: mockResident.id,
          name: "Owner",
          email: null,
          phone: "9000000001",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: true,
        },
        {
          userId: "u-kid",
          name: "Family Kid",
          email: null,
          phone: "9000000002",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: false,
        },
      ],
    });
    cy.get('[data-testid="account-family-dialog-save"]').click();
    cy.wait("@addFamily");
    cy.get('[data-testid="account-family-message"]').should("contain", "Family Kid");
  });

  it("lets a family member see who lives in the flat", () => {
    cy.loginAsResident();
    cy.intercept("GET", "**/v1/profile", {
      statusCode: 200,
      body: {
        userId: "u-kid",
        emergencyContact: null,
        vehicleNumber: null,
        societyName: "Keshav Heights",
        flat: {
          id: "flat-1",
          number: "101",
          wingName: "A",
          buildingName: "Tower A",
          floor: 1,
          parkingSlot: "P-101",
          pngGasConnection: false,
          adultCount: 2,
          childCount: 0,
          seniorCitizenCount: 0,
          twoWheelerCount: 0,
          fourWheelerCount: 0,
          isOwner: false,
        },
        vehicles: [],
      },
    }).as("profile");
    cy.intercept("GET", "**/v1/household/members", {
      statusCode: 200,
      body: [
        {
          userId: "u-owner",
          name: "Demo Resident",
          email: "resident@keshav.local",
          phone: "8888888888",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: true,
        },
        {
          userId: "u-kid",
          name: "Family Kid",
          email: null,
          phone: "9000000002",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: false,
        },
      ],
    }).as("household");
    cy.intercept("GET", "**/v1/parking", { statusCode: 200, body: [] });

    cy.visit("/account");
    cy.wait("@profile");
    cy.wait("@household");
    openHousehold();
    cy.get('[data-testid="account-tab-family"]').click();
    cy.get('[data-testid="account-family-owner"]').should("contain", "Demo Resident");
    cy.get('[data-testid="account-family-table"]').should("contain", "Demo Resident");
    cy.get('[data-testid="account-family-role-u-owner"]').should("contain", "Owner");
    cy.get('[data-testid="account-family-table"]').should("contain", "Family Kid");
    cy.get('[data-testid="account-family-role-u-kid"]').should("contain", "Family");
    cy.get('[data-testid="account-family-add"]').should("not.exist");
    cy.contains("Only the flat owner can add or remove family members.");
  });
});
