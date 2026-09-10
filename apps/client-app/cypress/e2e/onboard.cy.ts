describe("Client App staff onboard resident (Admin mode)", () => {
  beforeEach(() => {
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/admin/flats", {
      statusCode: 200,
      body: [
        {
          id: "flat-1",
          number: "101",
          wingName: "A",
          floor: 7,
          parkingSlot: "P-CSV-UPD",
        },
        {
          id: "flat-2",
          number: "201",
          wingName: "B",
          floor: 2,
          parkingSlot: "P-201",
        },
      ],
    }).as("flats");
    cy.intercept("GET", "**/v1/admin/residents", {
      statusCode: 200,
      body: [],
    }).as("residents");
    cy.intercept("GET", "**/v1/admin/parkings", {
      statusCode: 200,
      body: [
        {
          id: "p-open-1",
          slotNumber: "12",
          kind: "open",
          flatId: null,
          flatNumber: null,
          wing: null,
        },
        {
          id: "p-puz-1",
          slotNumber: "101",
          kind: "puzzle",
          wing: "A",
          flatId: "other-flat",
          flatNumber: "202",
        },
      ],
    }).as("parkings");
  });

  it("onboards a resident from the Client App Admin mode", () => {
    cy.visit("/onboard");
    cy.wait("@flats");

    cy.contains("h1", "Onboard resident").should("be.visible");
    cy.contains("Pick a flat to see Owner").should("be.visible");
    cy.get('[data-testid="onboard-society-name"]').should("be.disabled");

    cy.get('[data-testid="onboard-wing"]').should("have.value", "A");
    cy.get('[data-testid="onboard-flat"] option').should("have.length", 1);
    cy.get('[data-testid="onboard-flat"] option').first().should("have.text", "101");
    cy.get('[data-testid="onboard-flat"]').should("not.contain", "Fl ");
    cy.get('[data-testid="onboard-flat"]').should("not.contain", "P-CSV-UPD");
    cy.get('[data-testid="onboard-wing"]').select("B");
    cy.get('[data-testid="onboard-flat"]').should("have.value", "flat-2");
    cy.get('[data-testid="onboard-flat"] option').first().should("have.text", "201");
    cy.get('[data-testid="onboard-floor"]').should("have.value", "2");
    cy.get('[data-testid="onboard-selected-flat"]').should("contain", "B-201");
    cy.get('[data-testid="onboard-tabs"]').should("be.visible");
    cy.get('[data-testid="onboard-tab-owner"]').should("have.attr", "aria-selected", "true");
    cy.get("#onboard-email").should("not.have.attr", "required");
    cy.get('[data-testid="onboard-is-owner"]').should("exist");
    cy.get('[data-testid="onboard-phone"]').should("be.visible");
    cy.get('[data-testid="onboard-email"]').should("be.visible");
    cy.get('[data-testid="onboard-allotted-parking"]').should("not.exist");

    cy.get('[data-testid="onboard-tab-parking"]').click();
    cy.get('[data-testid="onboard-allotted-parking"]').should("be.visible");
    cy.get('[data-testid="onboard-parking-kind"]').should("have.value", "open");
    cy.get('[data-testid="onboard-parking"]').should("contain", "12");
    cy.get('[data-testid="onboard-parking-kind"]').select("puzzle");
    cy.get('[data-testid="onboard-parking"]').should("contain", "assigned to 202");
    cy.get('[data-testid="onboard-parking-hint"]').should("contain", "Open");

    cy.get('[data-testid="onboard-tab-family"]').click();
    cy.get('[data-testid="onboard-family-add"]').should("be.visible");
    cy.get('[data-testid="onboard-family-empty"]').should("be.visible");
    cy.get('[data-testid="onboard-adults"]').should("be.visible");
    cy.get('[data-testid="onboard-children"]').should("be.visible");
    cy.get('[data-testid="onboard-seniors"]').should("be.visible");

    cy.get('[data-testid="onboard-tab-two_wheeler"]').click();
    cy.get('[data-testid="onboard-two_wheeler-reg-0"]').should("be.visible");
    cy.get('[data-testid="onboard-two_wheeler-reg-1"]').should("be.visible");
    cy.get('[data-testid="onboard-add-two_wheeler"]').should("be.visible");

    cy.get('[data-testid="onboard-tab-four_wheeler"]').click();
    cy.get('[data-testid="onboard-four_wheeler-reg-0"]').should("be.visible");
    cy.get('[data-testid="onboard-add-four_wheeler"]').should("be.visible");

    cy.get('[data-testid="onboard-tab-gas"]').click();
    cy.get('[data-testid="onboard-png-no"]').should("exist");

    cy.get('[data-testid="onboard-tab-owner"]').click();
    cy.intercept("POST", "**/v1/admin/residents", {
      statusCode: 200,
      body: { user: { name: "Test Resident", phone: "9999999999" } },
    }).as("onboard");

    cy.get('[data-testid="onboard-name"]').type("Test Resident");
    cy.get("#phone").type("9999999999");
    cy.get('[data-testid="onboard-submit"]').click();

    cy.wait("@onboard");
    cy.contains("Onboarded Test Resident").should("be.visible");
  });

  it("lets staff edit the existing owner on the Owner tab", () => {
    cy.intercept("GET", "**/v1/admin/residents", {
      statusCode: 200,
      body: [
        {
          userId: "u-owner",
          name: "Demo Resident",
          email: "demo@example.com",
          phone: "8888888888",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: true,
        },
      ],
    }).as("residentsWithOwner");
    cy.visit("/onboard");
    cy.wait("@flats");
    cy.wait("@residentsWithOwner");

    cy.get('[data-testid="onboard-tabs"]').should("be.visible");
    cy.get('[data-testid="onboard-tab-family"]').should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.get('[data-testid="onboard-tab-owner"]').should("not.be.disabled");
    cy.get('[data-testid="onboard-tab-owner"]').click();
    cy.get('[data-testid="onboard-name"]').should("have.value", "Demo Resident");
    cy.get('[data-testid="onboard-phone"]').should("have.value", "8888888888");
    cy.get('[data-testid="onboard-email"]').should("have.value", "demo@example.com");
    cy.contains("Update owner").should("be.visible");

    cy.intercept("POST", "**/v1/admin/residents", (req) => {
      expect(req.body.editOwner).to.eq(true);
      expect(req.body.isOwner).to.eq(true);
      expect(req.body.name).to.eq("Demo Resident");
      req.reply({
        statusCode: 200,
        body: { user: { name: "Demo Resident", phone: "8888888888" } },
      });
    }).as("editOwner");

    cy.get('[data-testid="onboard-submit"]').click();
    cy.wait("@editOwner");
    cy.contains("Onboarded Demo Resident").should("be.visible");
  });

  it("lists family in a table and adds one from a dialog", () => {
    cy.intercept("GET", "**/v1/admin/residents", {
      statusCode: 200,
      body: [
        {
          userId: "u-owner",
          name: "Demo Resident",
          email: "demo@example.com",
          phone: "8888888888",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: true,
        },
        {
          userId: "u-fam",
          name: "Coverage Resident",
          email: null,
          phone: "9935637588",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: false,
        },
      ],
    }).as("household");
    cy.visit("/onboard");
    cy.wait("@flats");
    cy.wait("@household");
    cy.get('[data-testid="onboard-tab-family"]').should(
      "have.attr",
      "aria-selected",
      "true",
    );
    cy.get('[data-testid="onboard-family-table"]').should("contain", "Coverage Resident");
    cy.get('[data-testid="onboard-family-delete-u-fam"]').should("be.visible");
    cy.intercept("POST", "**/v1/admin/residents", (req) => {
      expect(req.body.name).to.eq("New Member");
      expect(req.body.isOwner).to.eq(false);
      req.reply({
        statusCode: 200,
        body: { user: { name: "New Member", phone: "9000000099" } },
      });
    }).as("addFamily");
    cy.get('[data-testid="onboard-family-add"]').click();
    cy.get('[data-testid="onboard-family-dialog"]').should("be.visible");
    cy.get('[data-testid="onboard-family-name"]').type("New Member");
    cy.get('[data-testid="onboard-family-phone"]').type("9000000099");
    cy.intercept("GET", "**/v1/admin/residents", {
      statusCode: 200,
      body: [
        {
          userId: "u-owner",
          name: "Demo Resident",
          email: "demo@example.com",
          phone: "8888888888",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: true,
        },
        {
          userId: "u-fam",
          name: "Coverage Resident",
          email: null,
          phone: "9935637588",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: false,
        },
        {
          userId: "u-new",
          name: "New Member",
          email: null,
          phone: "9000000099",
          flatId: "flat-1",
          flatNumber: "101",
          wingName: "A",
          isOwner: false,
        },
      ],
    });
    cy.get('[data-testid="onboard-family-dialog-save"]').click();
    cy.wait("@addFamily");
    cy.contains("Added New Member").should("be.visible");
  });
});
