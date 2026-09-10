describe("Manage login", () => {
  it("shows the branded sign-in card and signs in with email + password", () => {
    cy.intercept("POST", "**/v1/auth/password/login", {
      statusCode: 200,
      body: {
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          phone: null,
          email: "superadmin@societyhub.local",
          name: "Super Admin",
          username: null,
          role: "superadmin",
          tenantId: "22222222-2222-2222-2222-222222222222",
          flatId: null,
          flatNumber: null,
          hasPin: false,
        },
        tokens: { accessToken: "dev-access", refreshToken: "dev-refresh", expiresIn: 900 },
      },
    }).as("login");
    cy.intercept("GET", "**/v1/auth/memberships", { statusCode: 200, body: [] }).as("memberships");

    cy.visit("/login");
    cy.contains("SocietyHub").should("be.visible");
    cy.contains("Manage").should("be.visible");

    cy.get('[data-testid="login-email"]').type("superadmin@societyhub.local");
    cy.get('[data-testid="login-password"]').type("Test@1234");
    cy.get('[data-testid="login-submit"]').click();

    cy.wait("@login");
    cy.url().should("include", "/dashboard");
  });

  it("shows an error message on invalid credentials", () => {
    cy.intercept("POST", "**/v1/auth/password/login", {
      statusCode: 401,
      body: { code: "invalid_credentials", message: "Invalid email or password" },
    }).as("loginFailed");

    cy.visit("/login");
    cy.get('[data-testid="login-email"]').type("nope@societyhub.local");
    cy.get('[data-testid="login-password"]').type("wrongpass");
    cy.get('[data-testid="login-submit"]').click();

    cy.wait("@loginFailed");
    cy.get('[data-testid="login-error"]').should("be.visible");
  });

  it("keeps password login working after visiting the Google tab", () => {
    cy.intercept("POST", "**/v1/auth/password/login", {
      statusCode: 200,
      body: {
        user: {
          id: "11111111-1111-1111-1111-111111111111",
          phone: null,
          email: "superadmin@societyhub.local",
          name: "Super Admin",
          username: null,
          role: "superadmin",
          tenantId: "22222222-2222-2222-2222-222222222222",
          flatId: null,
          flatNumber: null,
          hasPin: false,
        },
        tokens: { accessToken: "dev-access", refreshToken: "dev-refresh", expiresIn: 900 },
      },
    }).as("login");
    cy.intercept("GET", "**/v1/auth/memberships", { statusCode: 200, body: [] });

    cy.visit("/login");
    cy.get('[data-testid="login-mode-google"]').click();
    cy.contains("Dev Google SSO").should("be.visible");
    cy.get('[data-testid="login-mode-password"]').click();
    cy.get('[data-testid="login-email"]').type("superadmin@societyhub.local");
    cy.get('[data-testid="login-password"]').type("Test@1234");
    cy.get('[data-testid="login-submit"]').click();
    cy.wait("@login");
    cy.url().should("include", "/dashboard");
  });
});
