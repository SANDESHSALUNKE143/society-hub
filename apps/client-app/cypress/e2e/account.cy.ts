import { mockResident } from "../support/commands";

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
    cy.get('[data-testid="account-adults"]').should("have.value", "2");
    cy.get('[data-testid="account-png-yes"]').should("be.checked");
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

    cy.visit("/account");
    cy.wait("@profile");
    cy.get('[data-testid="account-emergency-contact"]').clear().type("Trupti");
    cy.get('[data-testid="account-png-yes"]').check();
    cy.get('[data-testid="account-adults"]').clear().type("3");
    cy.get('[data-testid="account-children"]').clear().type("1");
    cy.get('[data-testid="account-seniors"]').clear().type("1");
    cy.get('[data-testid="account-profile-form"]').submit();
    cy.wait("@saveProfile");
    cy.contains("Profile updated.");
    cy.get('[data-testid="account-family-counts"]').should("contain", "3 adults");
    cy.get('[data-testid="account-png"]').should("contain", "Taken");
  });
});
