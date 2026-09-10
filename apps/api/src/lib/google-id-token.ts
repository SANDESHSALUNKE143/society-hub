import { AppError } from "./errors";

export type GoogleIdTokenClaims = {
  sub: string;
  email: string;
};

export type TokeninfoFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

type TokeninfoBody = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
};

export function tokeninfoUrl(idToken: string, endpoint: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("id_token", idToken);
  return url.toString();
}

function isVerifiedEmail(value: TokeninfoBody["email_verified"]): boolean {
  return value === true || value === "true";
}

export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
  fetchImpl: TokeninfoFetcher = fetch,
  endpoint = "https://oauth2.googleapis.com/tokeninfo",
): Promise<GoogleIdTokenClaims> {
  const res = await fetchImpl(tokeninfoUrl(idToken, endpoint));
  if (!res.ok) {
    throw new AppError(401, "invalid_google_token", "Google sign-in failed");
  }

  let body: TokeninfoBody;
  try {
    body = (await res.json()) as TokeninfoBody;
  } catch {
    throw new AppError(401, "invalid_google_token", "Google sign-in failed");
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (
    body.aud !== audience ||
    !body.sub ||
    !email ||
    !isVerifiedEmail(body.email_verified)
  ) {
    throw new AppError(401, "invalid_google_token", "Google sign-in failed");
  }

  return { sub: body.sub, email };
}
