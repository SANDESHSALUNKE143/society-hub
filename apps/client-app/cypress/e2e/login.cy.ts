describe("Resident login", () => {
  it("shows the sign-in card and signs in via OTP", () => {
    cy.intercept("POST", "**/v1/auth/otp/request", {
      statusCode: 200,
      body: { ok: true, devCode: "123456" },
    }).as("requestOtp");
    cy.intercept("POST", "**/v1/auth/otp/verify", {
      statusCode: 200,
      body: {
        user: {
          id: "33333333-3333-3333-3333-333333333333",
          phone: "8888888888",
          email: null,
          name: "Asha Rao",
          username: null,
          role: "resident",
          tenantId: "22222222-2222-2222-2222-222222222222",
          flatId: "flat-1",
          flatNumber: "A-101",
          hasPin: false,
        },
        tokens: { accessToken: "dev-access", refreshToken: "dev-refresh", expiresIn: 900 },
        memberships: [
          { tenantId: "22222222-2222-2222-2222-222222222222", societyName: "Keshav Heights", role: "resident" },
        ],
      },
    }).as("verifyOtp");
    cy.intercept("GET", "**/v1/auth/memberships", {
      statusCode: 200,
      body: [{ tenantId: "22222222-2222-2222-2222-222222222222", societyName: "Keshav Heights", role: "resident" }],
    }).as("memberships");

    cy.visit("/login");
    cy.contains("SocietyHub").should("be.visible");
    cy.contains("Resident sign-in").should("be.visible");

    cy.get('[data-testid="login-mode-otp"]').click();
    cy.get("#phone").type("8888888888");
    cy.contains("button", "Send OTP").click();
    cy.wait("@requestOtp");

    cy.get("#code").type("123456");
    cy.contains("button", "Verify & continue").click();
    cy.wait("@verifyOtp");

    cy.url().should("include", "/dashboard");
  });

  it("shows an error on a bad password login attempt", () => {
    cy.intercept("POST", "**/v1/auth/password/login", {
      statusCode: 401,
      body: { code: "invalid_credentials", message: "Invalid email or password" },
    }).as("loginFailed");

    cy.visit("/login");
    cy.get('[data-testid="login-email"]').type("nope@example.com");
    cy.get('[data-testid="login-password"]').type("wrongpass");
    cy.get('[data-testid="login-submit"]').click();

    cy.wait("@loginFailed");
    cy.get('[data-testid="login-error"]').should("be.visible");
  });

  it("signs in via the Google tab with a dev phone token", () => {
    cy.intercept("POST", "**/v1/auth/google", {
      statusCode: 200,
      body: {
        user: {
          id: "33333333-3333-3333-3333-333333333333",
          phone: "8888888888",
          email: "resident@keshav.local",
          name: "Asha Rao",
          username: null,
          role: "resident",
          tenantId: "22222222-2222-2222-2222-222222222222",
          flatId: "flat-1",
          flatNumber: "A-101",
          hasPin: false,
        },
        tokens: { accessToken: "dev-access", refreshToken: "dev-refresh", expiresIn: 900 },
        memberships: [
          { tenantId: "22222222-2222-2222-2222-222222222222", societyName: "Keshav Heights", role: "resident" },
        ],
      },
    }).as("googleLogin");
    cy.intercept("GET", "**/v1/auth/memberships", {
      statusCode: 200,
      body: [{ tenantId: "22222222-2222-2222-2222-222222222222", societyName: "Keshav Heights", role: "resident" }],
    });

    cy.visit("/login");
    cy.get('[data-testid="login-mode-google"]').click();
    cy.get("#phone-g").type("8888888888");
    cy.contains("button", "Continue with Google (dev)").click();
    cy.wait("@googleLogin");
    cy.url().should("include", "/dashboard");
  });

  it("shows an error when Google login is not onboarded", () => {
    cy.intercept("POST", "**/v1/auth/google", {
      statusCode: 403,
      body: { code: "not_onboarded", message: "Phone is not onboarded" },
    }).as("googleDenied");

    cy.visit("/login");
    cy.get('[data-testid="login-mode-google"]').click();
    cy.get("#phone-g").type("7000000004");
    cy.contains("button", "Continue with Google (dev)").click();
    cy.wait("@googleDenied");
    cy.get('[data-testid="login-error"]').should("be.visible");
  });
});
