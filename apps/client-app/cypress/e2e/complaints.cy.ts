describe("Resident complaints", () => {
  beforeEach(() => {
    cy.loginAsResident();
    cy.intercept("GET", "**/v1/complaints*", {
      statusCode: 200,
      body: {
        items: [
          {
            id: "c1",
            ticketNumber: "TCK-0007",
            title: "Lift not working",
            type: "lift",
            typeOtherText: null,
            description: "Lift stuck on 3rd floor",
            status: "in_progress",
            flatId: "flat-1",
            flatNumber: "A-101",
            residentName: "Asha Rao",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attachments: [],
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
      },
    }).as("complaints");
  });

  it("lists complaints and supports search", () => {
    cy.visit("/complaints");
    cy.wait("@complaints");

    cy.contains("h1", "Complaints").should("be.visible");
    cy.get('[data-testid="complaints-list"]').should("contain", "Lift not working");

    cy.get('[data-testid="complaints-search"]').type("nothing matches this");
    cy.get('[data-testid="complaints-empty"]').should("be.visible");
  });

  it("links to raise a new complaint", () => {
    cy.intercept("GET", "**/v1/admin/flats", { statusCode: 500 }).as("adminFlats");
    cy.visit("/complaints");
    cy.wait("@complaints");
    cy.get('[data-testid="new-complaint-link"]').click();
    cy.url().should("include", "/complaints/new");
    cy.get('[data-testid="complaint-linked-flat"]').should("contain", "A-101");
    cy.get('[data-testid="complaint-flat"]').should("not.exist");
    cy.get("@adminFlats.all").should("have.length", 0);
  });
});
