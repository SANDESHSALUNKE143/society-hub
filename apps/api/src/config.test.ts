import { describe, expect, test } from "bun:test";
import { env } from "./config";

describe("config", () => {
  test("exposes expected defaults shape", () => {
    expect(env.port).toBeGreaterThan(0);
    expect(env.databaseUrl).toContain("mysql://");
    expect(env.jwtSecret.length).toBeGreaterThan(10);
    expect(Array.isArray(env.corsOrigin)).toBe(true);
    expect(env.corsOrigin.length).toBeGreaterThan(0);
    expect(typeof env.googleClientId).toBe("string");
    expect(env.googleTokeninfoUrl).toContain("tokeninfo");
  });
});
