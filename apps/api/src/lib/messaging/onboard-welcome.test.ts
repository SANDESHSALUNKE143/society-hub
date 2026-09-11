import { describe, expect, test } from "bun:test";
import { deliverOnboardWelcome } from "./onboard-welcome";

describe("deliverOnboardWelcome", () => {
  test("sends stub email and WhatsApp without an invite token", async () => {
    const result = await deliverOnboardWelcome({
      societyName: "Keshav Heights",
      residentName: "DemWer",
      email: "resident@example.com",
      phone: "8888888888",
      channels: ["email", "whatsapp"],
    });
    expect(result.email?.ok).toBe(true);
    expect(result.whatsapp?.ok).toBe(true);
  });

  test("skips channels with no address", async () => {
    const result = await deliverOnboardWelcome({
      societyName: "Keshav Heights",
      residentName: "DemWer",
      channels: ["email", "whatsapp"],
    });
    expect(result.email).toBeUndefined();
    expect(result.whatsapp).toBeUndefined();
  });
});
