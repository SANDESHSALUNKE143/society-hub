describe("Client App staff onboard resident (Admin mode)", () => {
  beforeEach(() => {
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/admin/flats", {
      statusCode: 200,
      body: [{ id: "flat-1", number: "101", wingName: "A" }],
    }).as("flats");
  });

  it("onboards a resident from the Client App Admin mode", () => {
    cy.visit("/onboard");
    cy.wait("@flats");

    cy.contains("h1", "Onboard resident").should("be.visible");
    cy.contains("Several people").should("be.visible");
    cy.get('[data-testid="onboard-society-name"]').should("be.disabled");

    cy.get("#onboard-email").should("not.have.attr", "required");
    cy.get('[data-testid="onboard-png-no"]').should("exist");
    cy.get('[data-testid="onboard-adults"]').should("be.visible");
    cy.get('[data-testid="onboard-children"]').should("be.visible");
    cy.get('[data-testid="onboard-seniors"]').should("be.visible");
    cy.get('[data-testid="onboard-add-two_wheeler"]').should("be.visible");
    cy.get('[data-testid="onboard-add-four_wheeler"]').should("be.visible");

    cy.intercept("POST", "**/v1/admin/residents", {
      statusCode: 200,
      body: { user: { name: "Test Resident", phone: "9999999999" } },
    }).as("onboard");

    cy.get("#name").type("Test Resident");
    cy.get("#phone").type("9999999999");
    cy.get('[data-testid="onboard-submit"]').click();

    cy.wait("@onboard");
    cy.contains("Onboarded Test Resident").should("be.visible");
  });
});
