import { describe, expect, it } from "vitest";
import { LEGAL_COPY } from "./legal-copy";

describe("LEGAL_COPY", () => {
  it("publishes a real privacy policy, not a preview placeholder", () => {
    const body = LEGAL_COPY.privacy.body.join(" ");
    expect(body.toLowerCase()).not.toContain("placeholder");
    expect(body.toLowerCase()).not.toContain("preview placeholder");
    expect(body).toContain("OTP");
    expect(body).toContain("Google");
    expect(body).toContain("photo");
    expect(body).toContain("complaint");
    expect(body.toLowerCase()).toContain("admin");
  });

  it("publishes real terms of service, not a preview placeholder", () => {
    const body = LEGAL_COPY.terms.body.join(" ");
    expect(body.toLowerCase()).not.toContain("placeholder");
    expect(body.toLowerCase()).not.toContain("not binding");
  });
});
