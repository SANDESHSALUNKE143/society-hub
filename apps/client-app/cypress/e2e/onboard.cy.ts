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

    cy.contains("h1", "Add residents").should("be.visible");
    cy.get('[data-testid="onboard-society-name"]').should("be.disabled");

    cy.get("#onboard-email:invalid").should("exist");

    cy.intercept("POST", "**/v1/admin/residents", {
      statusCode: 200,
      body: {
        user: { name: "Test Resident", phone: "9999999999" },
        resident: { id: "res-1" },
      },
    }).as("onboard");

    cy.get("#name").type("Test Resident");
    cy.get("#phone").type("9999999999");
    cy.get("#onboard-email").type("resident@example.com");
    cy.get('[data-testid="onboard-submit"]').click();

    cy.wait("@onboard");
    cy.contains("Onboarded Test Resident").should("be.visible");
  });
});
