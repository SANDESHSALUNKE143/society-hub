import { and, eq, sql } from "drizzle-orm";
import { env } from "../../config";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import {
  verifyGoogleIdToken,
  type GoogleIdTokenClaims,
} from "../../lib/google-id-token";

export async function claimsFromGoogleIdToken(
  idToken: string,
): Promise<GoogleIdTokenClaims> {
  return verifyGoogleIdToken(
    idToken,
    env.googleClientId,
    fetch,
    env.googleTokeninfoUrl,
  );
}

export async function findOnboardedGoogleUser(claims: GoogleIdTokenClaims) {
  const [bySub] = await db
    .select()
    .from(users)
    .where(and(eq(users.googleSub, claims.sub), eq(users.isDeleted, false)))
    .limit(1);
  if (bySub) return bySub;

  const [byEmail] = await db
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = ${claims.email}`, eq(users.isDeleted, false)))
    .limit(1);
  if (!byEmail) {
    throw new AppError(403, "not_onboarded", "Email is not onboarded");
  }

  if (!byEmail.googleSub) {
    await db
      .update(users)
      .set({ googleSub: claims.sub })
      .where(eq(users.id, byEmail.id));
    return { ...byEmail, googleSub: claims.sub };
  }

  return byEmail;
}
