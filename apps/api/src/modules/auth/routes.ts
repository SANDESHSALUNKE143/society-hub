import { Elysia } from "elysia";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  hashPassword,
  hashPin,
  verifyPassword,
  verifyPin,
  verifyRefreshToken,
} from "@society-hub/auth";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginPasswordSchema,
  loginPinSchema,
  refreshSchema,
  requestOtpSchema,
  resetPasswordSchema,
  selectTenantSchema,
  setPinSchema,
  updateResidentProfileSchema,
  verifyOtpSchema,
} from "@society-hub/validation";
import { env } from "../../config";
import { db } from "../../db/client";
import {
  otpChallenges,
  passwordResetChallenges,
  refreshTokens,
  societies,
  userRoles,
  users,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { ActivityType, recordAudit } from "../../lib/audit";
import {
  authPlugin,
  buildUserDto,
  hashToken,
  issueTokens,
  listMemberships,
  requireAuth,
  resolveMembership,
} from "../../lib/auth-context";
import { applyResidentProfilePatch, getProfileDto } from "../profile/routes";
import {
  claimsFromGoogleIdToken,
  findOnboardedGoogleUser,
} from "./google-login";

function trackLogin(
  userId: string,
  tenantId: string,
  action: string,
  message: string,
) {
  return recordAudit({
    tenantId,
    actorUserId: userId,
    action,
    entityType: "user",
    entityId: userId,
    message,
  });
}

function nowMysql() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

export const authRoutes = new Elysia({ prefix: "/v1/auth" })
  .use(authPlugin)
  .post("/otp/request", async ({ body }) => {
    const parsed = requestOtpSchema.parse(body);
    const code = env.devAuth ? env.devOtpCode : String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await Bun.password.hash(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");

    await db.insert(otpChallenges).values({
      id: crypto.randomUUID(),
      phone: parsed.phone,
      codeHash,
      expiresAt,
    });

    // MSG91 integration later; in DEV return code for local/mobile testing
    return {
      ok: true as const,
      ...(env.devAuth ? { devCode: code } : {}),
    };
  })
  .post("/otp/verify", async ({ body }) => {
    const parsed = verifyOtpSchema.parse(body);
    const [challenge] = await db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.phone, parsed.phone),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, nowMysql()),
        ),
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);

    if (!challenge) {
      throw new AppError(400, "otp_invalid", "OTP expired or not found");
    }

    const ok =
      (env.devAuth && parsed.code === env.devOtpCode) ||
      (await Bun.password.verify(parsed.code, challenge.codeHash));
    if (!ok) {
      await db
        .update(otpChallenges)
        .set({ attempts: challenge.attempts + 1 })
        .where(eq(otpChallenges.id, challenge.id));
      throw new AppError(400, "otp_invalid", "Invalid OTP");
    }

    await db
      .update(otpChallenges)
      .set({ consumedAt: nowMysql() })
      .where(eq(otpChallenges.id, challenge.id));

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, parsed.phone), eq(users.isDeleted, false)))
      .limit(1);
    if (!user) {
      throw new AppError(403, "not_onboarded", "Phone is not onboarded");
    }

    const membership = await resolveMembership(user.id);
    const dto = await buildUserDto(user.id, membership.tenantId, membership.role);
    const tokens = await issueTokens(
      user.id,
      membership.role,
      membership.tenantId,
      dto.flatId,
    );
    const memberships = await listMemberships(user.id);
    await trackLogin(
      user.id,
      membership.tenantId,
      ActivityType.USER_OTP_LOGIN,
      "Signed in with OTP",
    );
    return { user: dto, tokens, memberships };
  })
  .post("/google", async ({ body }) => {
    const parsed = googleAuthSchema.parse(body);
    const allowDevGoogle = env.devAuth || !env.googleClientId;
    let user: typeof users.$inferSelect;

    if (parsed.idToken.startsWith("dev:")) {
      if (!allowDevGoogle) {
        throw new AppError(
          400,
          "invalid_google_token",
          "DEV Google token must be 'dev:<phone>'",
        );
      }
      const phone = parsed.idToken.slice("dev:".length);
      const [devUser] = await db
        .select()
        .from(users)
        .where(and(eq(users.phone, phone), eq(users.isDeleted, false)))
        .limit(1);
      if (!devUser) {
        throw new AppError(403, "not_onboarded", "Phone is not onboarded");
      }
      user = devUser;
    } else if (!env.googleClientId) {
      throw new AppError(
        400,
        "invalid_google_token",
        "DEV Google token must be 'dev:<phone>'",
      );
    } else {
      const claims = await claimsFromGoogleIdToken(parsed.idToken);
      user = await findOnboardedGoogleUser(claims);
    }

    const membership = await resolveMembership(user.id);
    const dto = await buildUserDto(user.id, membership.tenantId, membership.role);
    const tokens = await issueTokens(
      user.id,
      membership.role,
      membership.tenantId,
      dto.flatId,
    );
    const memberships = await listMemberships(user.id);
    await trackLogin(
      user.id,
      membership.tenantId,
      ActivityType.USER_GOOGLE_LOGIN,
      parsed.idToken.startsWith("dev:")
        ? "Signed in with Google (dev)"
        : "Signed in with Google",
    );
    return { user: dto, tokens, memberships };
  })
  .post("/pin/login", async ({ body }) => {
    const parsed = loginPinSchema.parse(body);
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, parsed.phone), eq(users.isDeleted, false)))
      .limit(1);
    if (!user?.pinHash) {
      throw new AppError(400, "pin_not_set", "PIN not set for this user");
    }
    const ok = await verifyPin(parsed.pin, user.pinHash);
    if (!ok) throw new AppError(401, "pin_invalid", "Invalid PIN");

    const membership = await resolveMembership(user.id);
    const dto = await buildUserDto(user.id, membership.tenantId, membership.role);
    const tokens = await issueTokens(
      user.id,
      membership.role,
      membership.tenantId,
      dto.flatId,
    );
    const memberships = await listMemberships(user.id);
    await trackLogin(
      user.id,
      membership.tenantId,
      ActivityType.USER_PIN_LOGIN,
      "Signed in with PIN",
    );
    return { user: dto, tokens, memberships };
  })
  .post("/password/login", async ({ body }) => {
    const parsed = loginPasswordSchema.parse(body);
    const email = parsed.email.toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isDeleted, false)))
      .limit(1);
    if (!user?.passwordHash) {
      throw new AppError(401, "invalid_credentials", "Invalid email or password");
    }
    const ok = await verifyPassword(parsed.password, user.passwordHash);
    if (!ok) {
      throw new AppError(401, "invalid_credentials", "Invalid email or password");
    }

    const membership = await resolveMembership(user.id);
    const dto = await buildUserDto(user.id, membership.tenantId, membership.role);
    const tokens = await issueTokens(
      user.id,
      membership.role,
      membership.tenantId,
      dto.flatId,
    );
    const memberships = await listMemberships(user.id);
    await trackLogin(
      user.id,
      membership.tenantId,
      ActivityType.USER_PASSWORD_LOGIN,
      "Signed in with email and password",
    );
    return { user: dto, tokens, memberships };
  })
  .post("/password/forgot", async ({ body }) => {
    const parsed = forgotPasswordSchema.parse(body);
    const email = parsed.email.toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isDeleted, false)))
      .limit(1);

    // Always OK to avoid email enumeration; only issue code when account exists
    if (!user) {
      return { ok: true as const };
    }

    const code = env.devAuth
      ? env.devOtpCode
      : String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await Bun.password.hash(code);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000)
      .toISOString()
      .replace("T", " ")
      .replace("Z", "");

    await db.insert(passwordResetChallenges).values({
      id: crypto.randomUUID(),
      email,
      codeHash,
      expiresAt,
    });

    // Email provider later (Resend); DEV returns code for local web/mobile
    return {
      ok: true as const,
      ...(env.devAuth ? { devCode: code } : {}),
    };
  })
  .post("/password/reset", async ({ body }) => {
    const parsed = resetPasswordSchema.parse(body);
    const email = parsed.email.toLowerCase();
    const [challenge] = await db
      .select()
      .from(passwordResetChallenges)
      .where(
        and(
          eq(passwordResetChallenges.email, email),
          isNull(passwordResetChallenges.consumedAt),
          gt(passwordResetChallenges.expiresAt, nowMysql()),
        ),
      )
      .orderBy(desc(passwordResetChallenges.createdAt))
      .limit(1);

    if (!challenge) {
      throw new AppError(400, "reset_invalid", "Reset code expired or not found");
    }

    const ok =
      (env.devAuth && parsed.code === env.devOtpCode) ||
      (await Bun.password.verify(parsed.code, challenge.codeHash));
    if (!ok) {
      await db
        .update(passwordResetChallenges)
        .set({ attempts: challenge.attempts + 1 })
        .where(eq(passwordResetChallenges.id, challenge.id));
      throw new AppError(400, "reset_invalid", "Invalid reset code");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isDeleted, false)))
      .limit(1);
    if (!user) {
      throw new AppError(400, "reset_invalid", "Reset code expired or not found");
    }

    const passwordHash = await hashPassword(parsed.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    await db
      .update(passwordResetChallenges)
      .set({ consumedAt: nowMysql() })
      .where(eq(passwordResetChallenges.id, challenge.id));

    return { ok: true as const };
  })
  .post("/password/change", async ({ body, auth }) => {
    const claims = requireAuth(auth);
    const parsed = changePasswordSchema.parse(body);
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, claims.sub), eq(users.isDeleted, false)))
      .limit(1);
    if (!user?.passwordHash) {
      throw new AppError(
        400,
        "password_not_set",
        "No password set for this account; use forgot password first",
      );
    }
    const ok = await verifyPassword(parsed.currentPassword, user.passwordHash);
    if (!ok) {
      throw new AppError(401, "invalid_credentials", "Current password is incorrect");
    }
    const passwordHash = await hashPassword(parsed.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    return { ok: true as const };
  })
  .post("/pin", async ({ body, auth }) => {
    const claims = requireAuth(auth);
    const parsed = setPinSchema.parse(body);
    const pinHash = await hashPin(parsed.pin);
    await db
      .update(users)
      .set({ pinHash, pinUpdatedAt: nowMysql() })
      .where(eq(users.id, claims.sub));
    return { ok: true as const };
  })
  .post("/refresh", async ({ body }) => {
    const parsed = refreshSchema.parse(body);
    let payload;
    try {
      payload = await verifyRefreshToken(parsed.refreshToken, env.jwtSecret);
    } catch {
      throw new AppError(401, "invalid_refresh", "Invalid refresh token");
    }

    const [stored] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, payload.jti))
      .limit(1);
    if (!stored || stored.revokedAt) {
      throw new AppError(401, "invalid_refresh", "Refresh token revoked");
    }
    if (hashToken(parsed.refreshToken) !== stored.tokenHash) {
      throw new AppError(401, "invalid_refresh", "Invalid refresh token");
    }

    await db
      .update(refreshTokens)
      .set({ revokedAt: nowMysql() })
      .where(eq(refreshTokens.id, stored.id));

    const membership = await resolveMembership(payload.sub);
    const dto = await buildUserDto(
      payload.sub,
      membership.tenantId,
      membership.role,
    );
    return issueTokens(
      payload.sub,
      membership.role,
      membership.tenantId,
      dto.flatId,
    );
  })
  .post("/logout", async ({ body, auth }) => {
    requireAuth(auth);
    const parsed = refreshSchema.parse(body);
    try {
      const payload = await verifyRefreshToken(parsed.refreshToken, env.jwtSecret);
      await db
        .update(refreshTokens)
        .set({ revokedAt: nowMysql() })
        .where(eq(refreshTokens.id, payload.jti));
    } catch {
      /* ignore */
    }
    return { ok: true as const };
  })
  .get("/me", async ({ auth }) => {
    const claims = requireAuth(auth);
    return buildUserDto(claims.sub, claims.tenantId, claims.role);
  })
  .get("/memberships", async ({ auth }) => {
    const claims = requireAuth(auth);
    return listMemberships(claims.sub);
  })
  .post("/select-tenant", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = selectTenantSchema.parse(body);

    const [society] = await db
      .select()
      .from(societies)
      .where(
        and(eq(societies.id, parsed.tenantId), eq(societies.isDeleted, false)),
      )
      .limit(1);
    if (!society) {
      throw new AppError(404, "society_not_found", "Society not found");
    }

    let role = claims.role;
    if (claims.role !== "superadmin") {
      const [membership] = await db
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, claims.sub),
            eq(userRoles.tenantId, parsed.tenantId),
            eq(userRoles.isDeleted, false),
          ),
        )
        .limit(1);
      if (!membership) {
        throw new AppError(
          403,
          "not_a_member",
          "You do not have a role in that society",
        );
      }
      role = membership.role;
    }

    const dto = await buildUserDto(claims.sub, parsed.tenantId, role);
    const tokens = await issueTokens(
      claims.sub,
      role,
      parsed.tenantId,
      dto.flatId,
    );
    return { user: dto, tokens };
  })
  .patch("/profile", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = updateResidentProfileSchema.parse(body);
    await applyResidentProfilePatch(claims.tenantId, claims.sub, parsed);
    return getProfileDto(claims.tenantId, claims.sub);
  });
