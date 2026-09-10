import { describe, expect, test } from "bun:test";
import { googleSignInMode } from "./google-sign-in";

describe("googleSignInMode", () => {
  test("uses GIS when a Web client ID is configured", () => {
    expect(
      googleSignInMode("583640086898-abc.apps.googleusercontent.com"),
    ).toBe("gis");
  });

  test("falls back to the dev phone form when the client ID is empty", () => {
    expect(googleSignInMode(undefined)).toBe("dev");
    expect(googleSignInMode("")).toBe("dev");
    expect(googleSignInMode("   ")).toBe("dev");
  });
});
