import { mockStaff } from "../support/commands";

describe("Select society", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const tenantB = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/auth/memberships", {
      statusCode: 200,
      body: [
        {
          tenantId: tenantA,
          societyName: "Keshav Heights",
          role: "superadmin",
          canUseAdminMode: true,
        },
        {
          tenantId: tenantB,
          societyName: "Other Society",
          role: "superadmin",
          canUseAdminMode: true,
        },
      ],
    }).as("memberships");
  });

  it("continues into the chosen society dashboard", () => {
    cy.intercept("POST", "**/v1/auth/select-tenant", {
      statusCode: 200,
      body: {
        user: { ...mockStaff, tenantId: tenantB, role: "superadmin" },
        tokens: {
          accessToken: "switched-access",
          refreshToken: "switched-refresh",
          expiresIn: 900,
        },
      },
    }).as("selectTenant");

    cy.visit("/select-society");
    cy.wait("@memberships");
    cy.contains("Choose your society").should("be.visible");
    cy.contains('[data-testid="select-society-option"]', "Other Society").click();
    cy.wait("@selectTenant")
      .its("request.body")
      .should("deep.equal", { tenantId: tenantB });
    cy.url().should("include", "/dashboard");
  });

  it("shows an error when select-tenant fails", () => {
    cy.intercept("POST", "**/v1/auth/select-tenant", {
      statusCode: 403,
      body: { code: "not_a_member", message: "You do not have a role in that society" },
    }).as("selectTenantFail");

    cy.visit("/select-society");
    cy.wait("@memberships");
    cy.get('[data-testid="select-society-option"]').first().click();
    cy.wait("@selectTenantFail");
    cy.get('[data-testid="select-society-error"]').should(
      "contain",
      "You do not have a role in that society",
    );
    cy.url().should("include", "/select-society");
  });

  it("skips the picker when the same society has two roles", () => {
    cy.intercept("GET", "**/v1/auth/memberships", {
      statusCode: 200,
      body: [
        {
          tenantId: tenantA,
          societyName: "Keshav Heights",
          role: "committee",
          canUseAdminMode: true,
        },
        {
          tenantId: tenantA,
          societyName: "Keshav Heights",
          role: "chairperson",
          canUseAdminMode: true,
        },
      ],
    }).as("membershipsSameSociety");

    cy.visit("/select-society");
    cy.wait("@membershipsSameSociety");
    cy.contains("Choose your society").should("not.exist");
    cy.url().should("include", "/dashboard");
  });
});
