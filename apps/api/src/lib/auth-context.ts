import { and, eq } from "drizzle-orm";
import {
  accessExpiresInSeconds,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  type AccessClaims,
} from "@society-hub/auth";
import type { Role, UserDto } from "@society-hub/types";
import { Elysia } from "elysia";
import { env } from "../config";
import { db } from "../db/client";
import {
  flats,
  refreshTokens,
  residents,
  societies,
  userRoles,
  users,
} from "../db/schema";
import { AppError } from "./errors";
import {
  hashToken,
  canUseAdminMode,
  collapseMembershipsByTenant,
  isPlatformRole,
  normalizeRole,
  pickDefaultRole,
} from "./auth-helpers";

export {
  hashToken,
  isStaffRole,
  isSocietyStaffRole,
  isPlatformRole,
  isResidentLikeRole,
  canUseAdminMode,
  normalizeRole,
  requireAuth,
  requireRole,
  requireSocietyStaff,
  requirePlatform,
  SOCIETY_STAFF_ROLES,
  RESIDENT_ROLES,
  PLATFORM_ROLES,
} from "./auth-helpers";

export async function buildUserDto(
  userId: string,
  tenantId: string,
  role: Role,
): Promise<UserDto> {
  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isDeleted, false)))
    .limit(1);
  if (!user) throw new AppError(404, "user_not_found", "User not found");

  let flatId: string | null = null;
  let flatNumber: string | null = null;
  // Staff (e.g. chairperson/president) may also live in a flat — attach it whenever present.
  const [res] = await db
    .select({
      flatId: residents.flatId,
      number: flats.number,
    })
    .from(residents)
    .innerJoin(flats, eq(flats.id, residents.flatId))
    .where(
      and(
        eq(residents.userId, userId),
        eq(residents.tenantId, tenantId),
        eq(residents.isDeleted, false),
        eq(flats.isDeleted, false),
      ),
    )
    .limit(1);
  flatId = res?.flatId ?? null;
  flatNumber = res?.number ?? null;

  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    name: user.name,
    username: user.username,
    role: role === "admin" ? "chairperson" : role,
    tenantId,
    flatId,
    flatNumber,
    hasPin: Boolean(user.pinHash),
  };
}

export async function issueTokens(
  userId: string,
  role: Role,
  tenantId: string,
  flatId?: string | null,
) {
  const accessToken = await signAccessToken(
    { sub: userId, role, tenantId, flatId: flatId ?? null },
    env.jwtSecret,
  );
  const jti = crypto.randomUUID();
  const refreshToken = await signRefreshToken(userId, jti, env.jwtSecret);
  const tokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");

  await db.insert(refreshTokens).values({
    id: jti,
    userId,
    tokenHash,
    expiresAt,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: accessExpiresInSeconds(),
  };
}

export async function listMemberships(userId: string) {
  const rows = await db
    .select({
      tenantId: userRoles.tenantId,
      role: userRoles.role,
      societyName: societies.name,
    })
    .from(userRoles)
    .innerJoin(societies, eq(societies.id, userRoles.tenantId))
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.isDeleted, false),
        eq(societies.isDeleted, false),
      ),
    );

  const platformMembership = rows.find((r) => isPlatformRole(r.role as Role));
  if (platformMembership) {
    const platformRole = normalizeRole(platformMembership.role as Role);
    const allSocieties = await db
      .select({ id: societies.id, name: societies.name })
      .from(societies)
      .where(eq(societies.isDeleted, false));
    return allSocieties.map((s) => ({
      tenantId: s.id,
      societyName: s.name,
      role: platformRole,
      canUseAdminMode: true,
    }));
  }

  return collapseMembershipsByTenant(
    rows.map((r) => {
      const role = normalizeRole(r.role as Role);
      return {
        tenantId: r.tenantId,
        societyName: r.societyName,
        role,
        canUseAdminMode: canUseAdminMode(role),
      };
    }),
  );
}

export async function resolveRoleForTenant(userId: string, tenantId: string) {
  const rows = await db
    .select()
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.isDeleted, false),
      ),
    );
  if (!rows.length) return null;
  const preferred = pickDefaultRole(rows.map((r) => r.role as Role));
  const match =
    rows.find((r) => normalizeRole(r.role as Role) === preferred) ?? rows[0]!;
  return normalizeRole(match.role as Role);
}

export async function resolveMembership(userId: string) {
  const rows = await db
    .select()
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, userId), eq(userRoles.isDeleted, false)),
    );
  if (!rows.length) {
    throw new AppError(
      403,
      "not_onboarded",
      "Phone is not onboarded to any society",
    );
  }
  const preferred = pickDefaultRole(rows.map((r) => r.role as Role));
  return (
    rows.find((r) => normalizeRole(r.role as Role) === preferred) ?? rows[0]!
  );
}

export const authPlugin = new Elysia({ name: "auth" }).derive(
  { as: "scoped" },
  async ({ request }) => {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) {
      return { auth: null as AccessClaims | null };
    }
    const token = header.slice("Bearer ".length);
    try {
      const claims = await verifyAccessToken(token, env.jwtSecret);
      return { auth: claims };
    } catch {
      return { auth: null as AccessClaims | null };
    }
  },
);
