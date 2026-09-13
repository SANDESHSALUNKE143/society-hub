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
    expect(typeof env.isProduction).toBe("boolean");
  });

  test("fails closed in production without DATABASE_URL", () => {
    const prevUrl = process.env.DATABASE_URL;
    const prevNode = process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = "production";
    try {
      expect(() => env.databaseUrl).toThrow(/DATABASE_URL is required in production/);
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevUrl;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  test("fails closed in production without JWT_SECRET", () => {
    const prevSecret = process.env.JWT_SECRET;
    const prevNode = process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "production";
    try {
      expect(() => env.jwtSecret).toThrow(/JWT_SECRET is required in production/);
    } finally {
      if (prevSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prevSecret;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });

  test("uses local defaults when secrets missing outside production", () => {
    const prevUrl = process.env.DATABASE_URL;
    const prevSecret = process.env.JWT_SECRET;
    const prevNode = process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";
    try {
      expect(env.databaseUrl).toContain("mysql://");
      expect(env.jwtSecret.length).toBeGreaterThan(10);
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prevUrl;
      if (prevSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = prevSecret;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
    }
  });
});
