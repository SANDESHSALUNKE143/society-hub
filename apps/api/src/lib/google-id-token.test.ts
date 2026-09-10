import { describe, expect, test } from "bun:test";
import { AppError } from "./errors";
import { tokeninfoUrl, verifyGoogleIdToken } from "./google-id-token";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("tokeninfoUrl", () => {
  test("appends the id token to the Google tokeninfo endpoint", () => {
    expect(tokeninfoUrl("abc.def", "https://oauth2.googleapis.com/tokeninfo")).toBe(
      "https://oauth2.googleapis.com/tokeninfo?id_token=abc.def",
    );
  });
});

describe("verifyGoogleIdToken", () => {
  const audience = "123-web.apps.googleusercontent.com";

  test("returns sub and email when aud matches and email is verified", async () => {
    const claims = await verifyGoogleIdToken("good.jwt", audience, async () =>
      jsonResponse({
        aud: audience,
        sub: "google-sub-1",
        email: "Admin@Keshav.local",
        email_verified: "true",
      }),
    );
    expect(claims).toEqual({
      sub: "google-sub-1",
      email: "admin@keshav.local",
    });
  });

  test("accepts boolean email_verified", async () => {
    const claims = await verifyGoogleIdToken("good.jwt", audience, async () =>
      jsonResponse({
        aud: audience,
        sub: "google-sub-2",
        email: "resident@keshav.local",
        email_verified: true,
      }),
    );
    expect(claims.email).toBe("resident@keshav.local");
  });

  test("rejects tokens Google does not accept", async () => {
    try {
      await verifyGoogleIdToken("bad.jwt", audience, async () =>
        new Response("invalid token", { status: 400 }),
      );
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(401);
      expect((err as AppError).code).toBe("invalid_google_token");
    }
  });

  test("rejects tokens issued for a different client", async () => {
    try {
      await verifyGoogleIdToken("other.jwt", audience, async () =>
        jsonResponse({
          aud: "other-client.apps.googleusercontent.com",
          sub: "google-sub-3",
          email: "admin@keshav.local",
          email_verified: true,
        }),
      );
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("invalid_google_token");
    }
  });

  test("rejects a tokeninfo payload that is not JSON", async () => {
    try {
      await verifyGoogleIdToken("plain.jwt", audience, async () =>
        new Response("not-json", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      );
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("invalid_google_token");
    }
  });

  test("rejects unverified emails", async () => {
    try {
      await verifyGoogleIdToken("unverified.jwt", audience, async () =>
        jsonResponse({
          aud: audience,
          sub: "google-sub-4",
          email: "admin@keshav.local",
          email_verified: false,
        }),
      );
      throw new Error("expected AppError");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("invalid_google_token");
    }
  });
});
