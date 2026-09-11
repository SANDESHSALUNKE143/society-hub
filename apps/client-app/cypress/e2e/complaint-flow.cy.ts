import { mockResident, mockStaff } from "../support/commands";

describe("Complaint raise and office flow", () => {
  it("resident submits title, type, description and sees ticket + queue", () => {
    cy.loginAsResident();
    cy.intercept("POST", "**/v1/complaints", {
      statusCode: 200,
      body: {
        id: "c-new",
        ticketNumber: "C-12345678",
        title: "Lift stuck",
        type: "lift",
        typeOtherText: null,
        description: "Lift not moving between floors",
        status: "open",
        flatId: mockResident.flatId,
        flatNumber: "A-101",
        residentName: mockResident.name,
        assignedToUserId: null,
        slaDueAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queuePosition: 2,
        openAheadCount: 1,
        queueHint: "About 1 ticket ahead of yours in the queue.",
        attachments: [],
        comments: [],
        statusEvents: [],
        closingNote: null,
      },
    }).as("create");
    cy.intercept("GET", "**/v1/complaints/c-new", {
      statusCode: 200,
      body: {
        id: "c-new",
        ticketNumber: "C-12345678",
        title: "Lift stuck",
        type: "lift",
        typeOtherText: null,
        description: "Lift not moving between floors",
        status: "open",
        flatId: mockResident.flatId,
        flatNumber: "A-101",
        residentName: mockResident.name,
        assignedToUserId: null,
        slaDueAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queuePosition: 2,
        openAheadCount: 1,
        queueHint: "About 1 ticket ahead of yours in the queue.",
        attachments: [],
        comments: [],
        statusEvents: [],
        closingNote: null,
      },
    }).as("created");

    cy.visit("/complaints/new");
    cy.get('[data-testid="complaint-linked-flat"]').should("contain", "A-101");
    cy.get('[data-testid="complaint-flat"]').should("not.exist");
    cy.get('[data-testid="complaint-title"]').type("Lift stuck");
    cy.get('[data-testid="complaint-type-lift"]').click();
    cy.get('[data-testid="complaint-description"]').type("Lift not moving between floors");
    cy.get('[data-testid="complaint-submit"]').click();
    cy.wait("@create").its("request.body").then((body) => {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      expect(parsed.flatId).to.not.exist;
    });
    cy.url().should("include", "/complaints/c-new");
    cy.get('[data-testid="complaint-created-banner"]').should("be.visible");
    cy.get('[data-testid="complaint-ticket-number"]').should("contain", "C-12345678");
    cy.get('[data-testid="complaint-queue-hint"]').should("contain", "1 ticket ahead");
  });

  it("admin can acknowledge without closing, and must comment to close", () => {
    cy.loginAsStaff();
    cy.window().then((win) => win.localStorage.setItem("sh_app_mode", "admin"));
    cy.intercept("GET", "**/v1/complaints/c1", {
      statusCode: 200,
      body: {
        id: "c1",
        ticketNumber: "C-999",
        title: "Water leak",
        type: "plumbing",
        typeOtherText: null,
        description: "Bathroom",
        status: "open",
        flatId: "flat-1",
        flatNumber: "101",
        residentName: "Asha",
        assignedToUserId: null,
        slaDueAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queuePosition: 1,
        openAheadCount: 0,
        queueHint: "You are next in the queue — the office will pick this up soon.",
        attachments: [],
        comments: [],
        statusEvents: [],
        closingNote: null,
      },
    }).as("get");

    cy.intercept("PATCH", "**/v1/complaints/c1/status", (req) => {
      req.reply({
        statusCode: 200,
        body: {
          ...req.body,
          id: "c1",
          ticketNumber: "C-999",
          title: "Water leak",
          type: "plumbing",
          typeOtherText: null,
          description: "Bathroom",
          status: req.body.status,
          flatId: "flat-1",
          flatNumber: "101",
          residentName: "Asha",
          assignedToUserId: mockStaff.id,
          slaDueAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          queuePosition: null,
          openAheadCount: null,
          queueHint: null,
          attachments: [],
          comments: [],
          statusEvents: [
            {
              id: "e1",
              fromStatus: "open",
              toStatus: req.body.status,
              note: req.body.note,
              actorName: mockStaff.name,
              createdAt: new Date().toISOString(),
            },
          ],
          closingNote: req.body.status === "closed" ? req.body.note : null,
        },
      });
    }).as("status");

    cy.visit("/complaints/c1");
    cy.wait("@get");
    cy.get('[data-testid="complaint-staff-actions"]').should("be.visible");
    cy.get('[data-testid="complaint-ack"]').click();
    cy.wait("@status").its("request.body.status").should("eq", "assigned");

    cy.get('[data-testid="complaint-close"]').click();
    cy.contains("closing comment").should("be.visible");
    cy.get('[data-testid="complaint-staff-note"]').type("Pipe fixed and tested");
    cy.get('[data-testid="complaint-close"]').click();
    cy.wait("@status").its("request.body").should("include", {
      status: "closed",
      note: "Pipe fixed and tested",
    });
  });

  it("staff in Resident mode files against their linked flat only", () => {
    const staffResident = {
      ...mockStaff,
      flatId: "flat-1",
      flatNumber: "A-101",
    };
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/auth/me", {
      statusCode: 200,
      body: staffResident,
    });
    cy.window().then((win) => {
      win.localStorage.setItem("sh_web_user", JSON.stringify(staffResident));
      win.localStorage.setItem("sh_app_mode", "resident");
    });
    cy.intercept("GET", "**/v1/admin/flats", { statusCode: 500 }).as("adminFlats");
    cy.visit("/complaints/new");
    cy.get('[data-testid="complaint-linked-flat"]').should("contain", "A-101");
    cy.get('[data-testid="complaint-flat"]').should("not.exist");
    cy.get("@adminFlats.all").should("have.length", 0);
  });

  it("Admin mode shows the society flat picker", () => {
    cy.loginAsStaff();
    cy.intercept("GET", "**/v1/admin/flats", {
      statusCode: 200,
      body: [{ id: "flat-9", number: "909", wingName: "B", floor: 9 }],
    }).as("adminFlats");
    cy.visit("/complaints/new");
    cy.wait("@adminFlats");
    cy.get('[data-testid="complaint-flat"]').should("exist");
    cy.get('[data-testid="complaint-linked-flat"]').should("not.exist");
  });
});
