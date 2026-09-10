import { describe, expect, it } from "vitest";
import { LEGAL_LINKS } from "./legal-links";

describe("LEGAL_LINKS", () => {
  it("exposes public home, privacy, and terms paths for OAuth branding", () => {
    expect(LEGAL_LINKS).toEqual({
      home: "/home",
      privacy: "/privacy",
      terms: "/terms",
    });
  });
});
