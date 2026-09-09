import { and, eq, inArray } from "drizzle-orm";
import type { TeamMemberDto } from "@society-hub/types";
import { db } from "../../db/client";
import { societies, userRoles, users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { ActivityType, recordActivity } from "../../lib/audit";

export const SOCIETY_STAFF_ROLES = [
  "chairperson",
  "admin",
  "secretary",
  "treasurer",
  "cashier",
  "committee",
] as const;

export type TeamIdentity = {
  email?: string;
  phone?: string;
  name?: string;
  role?: (typeof SOCIETY_STAFF_ROLES)[number];
};

export function normalizeStaffRole(
  role: (typeof SOCIETY_STAFF_ROLES)[number] | undefined,
): (typeof SOCIETY_STAFF_ROLES)[number] {
  if (!role || role === "admin") return "chairperson";
  return role;
}

export function assertCanRemoveTeamMember(actorId: string, targetUserId: string) {
  if (actorId === targetUserId) {
    throw new AppError(
      400,
      "cannot_remove_self",
      "You cannot remove yourself from the team",
    );
  }
}

async function assertContactAvailable(
  userId: string | undefined,
  email?: string,
  phone?: string,
) {
  if (email) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (row && row.id !== userId) {
      throw new AppError(409, "email_taken", "This email is already used by another user");
    }
  }
  if (phone) {
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);
    if (row && row.id !== userId) {
      throw new AppError(409, "phone_taken", "This mobile is already used by another user");
    }
  }
}

export async function upsertTeamUser(
  parsed: TeamIdentity,
  actorId: string,
): Promise<string> {
  let userId: string | undefined;
  if (parsed.email) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.email.toLowerCase()))
      .limit(1);
    userId = byEmail?.id;
  }
  if (!userId && parsed.phone) {
    const [byPhone] = await db
      .select()
      .from(users)
      .where(eq(users.phone, parsed.phone))
      .limit(1);
    userId = byPhone?.id;
  }

  await assertContactAvailable(userId, parsed.email, parsed.phone);

  if (!userId) {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      email: parsed.email?.toLowerCase() ?? null,
      phone: parsed.phone ?? null,
      name: parsed.name ?? null,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return userId;
  }

  if (parsed.name || parsed.phone || parsed.email) {
    await db
      .update(users)
      .set({
        ...(parsed.name ? { name: parsed.name } : {}),
        ...(parsed.phone ? { phone: parsed.phone } : {}),
        ...(parsed.email ? { email: parsed.email.toLowerCase() } : {}),
        updatedBy: actorId,
      })
      .where(eq(users.id, userId));
  }
  return userId;
}

export async function listTeamForTenant(tenantId: string): Promise<TeamMemberDto[]> {
  return db
    .select({
      userId: userRoles.userId,
      role: userRoles.role,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        inArray(userRoles.role, [...SOCIETY_STAFF_ROLES]),
        eq(userRoles.isDeleted, false),
        eq(users.isDeleted, false),
      ),
    );
}

async function listStaffRoles(tenantId: string, userId: string) {
  return db
    .select()
    .from(userRoles)
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.userId, userId),
        inArray(userRoles.role, [...SOCIETY_STAFF_ROLES]),
        eq(userRoles.isDeleted, false),
      ),
    );
}

async function ensureStaffRole(
  tenantId: string,
  userId: string,
  role: (typeof SOCIETY_STAFF_ROLES)[number],
  actorId: string,
) {
  const [existingRole] = await db
    .select()
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.role, role),
      ),
    )
    .limit(1);

  if (!existingRole) {
    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      role,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return;
  }
  if (existingRole.isDeleted) {
    await db
      .update(userRoles)
      .set({ isDeleted: false, updatedBy: actorId })
      .where(eq(userRoles.id, existingRole.id));
  }
}

export async function addTeamMemberToTenant(
  tenantId: string,
  actorId: string,
  parsed: TeamIdentity,
) {
  if (!parsed.email && !parsed.phone) {
    throw new AppError(400, "identity_required", "email or phone is required");
  }

  const [society] = await db
    .select()
    .from(societies)
    .where(and(eq(societies.id, tenantId), eq(societies.isDeleted, false)))
    .limit(1);
  if (!society) throw new AppError(404, "not_found", "Society not found");

  const userId = await upsertTeamUser(parsed, actorId);
  const role = normalizeStaffRole(parsed.role);
  await ensureStaffRole(tenantId, userId, role, actorId);

  recordActivity({
    tenantId,
    actorUserId: actorId,
    action: ActivityType.SOCIETY_TEAM_MEMBER_ADDED,
    entityType: "user",
    entityId: userId,
    message: `Added ${parsed.email ?? parsed.phone ?? userId} as ${role} on ${society.name}`,
    meta: { role, societyId: tenantId, targetUserId: userId },
  });

  return {
    ok: true as const,
    userId,
    tenantId,
    role,
    societyName: society.name,
  };
}

async function replaceStaffRole(
  tenantId: string,
  targetUserId: string,
  actorId: string,
  roles: Awaited<ReturnType<typeof listStaffRoles>>,
  nextRole: (typeof SOCIETY_STAFF_ROLES)[number],
): Promise<TeamMemberDto["role"]> {
  const next = normalizeStaffRole(nextRole);
  const current = roles[0]!.role as TeamMemberDto["role"];
  if (next === current) return current;
  await ensureStaffRole(tenantId, targetUserId, next, actorId);
  for (const row of roles) {
    if (row.role !== next) {
      await db
        .update(userRoles)
        .set({ isDeleted: true, updatedBy: actorId })
        .where(eq(userRoles.id, row.id));
    }
  }
  return next;
}

export async function updateTeamMemberInTenant(
  tenantId: string,
  actorId: string,
  targetUserId: string,
  parsed: TeamIdentity,
): Promise<TeamMemberDto> {
  const roles = await listStaffRoles(tenantId, targetUserId);
  if (roles.length === 0) {
    throw new AppError(404, "not_found", "Team member not found");
  }

  await assertContactAvailable(targetUserId, parsed.email, parsed.phone);

  if (parsed.name || parsed.phone || parsed.email) {
    await db
      .update(users)
      .set({
        ...(parsed.name ? { name: parsed.name } : {}),
        ...(parsed.phone ? { phone: parsed.phone } : {}),
        ...(parsed.email ? { email: parsed.email.toLowerCase() } : {}),
        updatedBy: actorId,
      })
      .where(eq(users.id, targetUserId));
  }

  const role = parsed.role
    ? await replaceStaffRole(tenantId, targetUserId, actorId, roles, parsed.role)
    : (roles[0]!.role as TeamMemberDto["role"]);

  const [updated] = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!updated) throw new AppError(404, "not_found", "Team member not found");

  recordActivity({
    tenantId,
    actorUserId: actorId,
    action: ActivityType.SOCIETY_TEAM_MEMBER_UPDATED,
    entityType: "user",
    entityId: targetUserId,
    message: `Updated team member ${updated.email ?? updated.phone ?? targetUserId}`,
    meta: { role, targetUserId },
  });

  return { ...updated, role };
}

export async function removeTeamMemberFromTenant(
  tenantId: string,
  actorId: string,
  targetUserId: string,
) {
  assertCanRemoveTeamMember(actorId, targetUserId);
  const roles = await listStaffRoles(tenantId, targetUserId);
  if (roles.length === 0) {
    throw new AppError(404, "not_found", "Team member not found");
  }

  for (const row of roles) {
    await db
      .update(userRoles)
      .set({ isDeleted: true, updatedBy: actorId })
      .where(eq(userRoles.id, row.id));
  }

  recordActivity({
    tenantId,
    actorUserId: actorId,
    action: ActivityType.SOCIETY_TEAM_MEMBER_REMOVED,
    entityType: "user",
    entityId: targetUserId,
    message: `Removed team member ${targetUserId}`,
    meta: { targetUserId },
  });

  return { ok: true as const };
}
