import { Elysia } from "elysia";
import { and, eq, inArray } from "drizzle-orm";
import type { Role, TeamMemberDto } from "@society-hub/types";
import {
  addSocietyTeamMemberSchema,
  addTeamMemberSchema,
  changeTeamRoleSchema,
  updateSocietyTeamMemberSchema,
} from "@society-hub/validation";
import { db } from "../../db/client";
import { userRoles, users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { ActivityType, AuditEntity, recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import {
  SOCIETY_STAFF_ROLES,
  authPlugin,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";
import {
  addTeamMemberToTenant,
  removeTeamMemberFromTenant,
  updateTeamMemberInTenant,
} from "../admin/team-service";

const STAFF_ROLES = SOCIETY_STAFF_ROLES as Role[];

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
        inArray(userRoles.role, STAFF_ROLES),
        eq(userRoles.isDeleted, false),
        eq(users.isDeleted, false),
      ),
    );
}

/** Resolves (or creates) the person a team action targets, within this society. */
async function resolveTargetUser(
  actorUserId: string,
  input: { userId?: string; name?: string; email?: string | null; phone?: string | null },
) {
  if (input.userId) {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, input.userId), eq(users.isDeleted, false)))
      .limit(1);
    if (!row) throw new AppError(404, "user_not_found", "User not found");
    return row.id;
  }

  const email = input.email?.toLowerCase().trim() || null;
  const phone = input.phone?.replace(/\D/g, "") || null;

  if (email) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isDeleted, false)))
      .limit(1);
    if (byEmail) return byEmail.id;
  }
  if (phone) {
    const [byPhone] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.isDeleted, false)))
      .limit(1);
    if (byPhone) return byPhone.id;
  }

  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    name: input.name ?? null,
    email,
    phone,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  return id;
}

/**
 * Society-admin team management. Distinct from the platform-only
 * `POST /v1/manage/societies/:id/team`: this one is scoped to the caller's own
 * society and can never touch another tenant.
 */
export const teamRoutes = new Elysia({ prefix: "/v1/team" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return listTeamForTenant(claims.tenantId);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = addSocietyTeamMemberSchema.parse(body);
    return addTeamMemberToTenant(claims.tenantId, claims.sub, parsed);
  })
  .post("/members", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = addTeamMemberSchema.parse(body);
    const userId = await resolveTargetUser(claims.sub, parsed);

    const [existing] = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.tenantId, claims.tenantId),
          eq(userRoles.userId, userId),
          eq(userRoles.role, parsed.role),
        ),
      )
      .limit(1);

    if (existing && !existing.isDeleted) {
      throw new AppError(
        409,
        "already_team_member",
        `This person is already a ${parsed.role}`,
      );
    }
    if (existing) {
      await db
        .update(userRoles)
        .set({ isDeleted: false, updatedBy: claims.sub })
        .where(eq(userRoles.id, existing.id));
    } else {
      await db.insert(userRoles).values({
        id: crypto.randomUUID(),
        tenantId: claims.tenantId,
        userId,
        role: parsed.role,
        createdBy: claims.sub,
        updatedBy: claims.sub,
      });
    }

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.TEAM_MEMBER_ADDED,
      entityType: AuditEntity.USER,
      entityId: userId,
      message: `Added ${parsed.email ?? parsed.phone ?? userId} as ${parsed.role}`,
      meta: { role: parsed.role },
    });
    await notifyUser({
      tenantId: claims.tenantId,
      userId,
      title: "Added to the society team",
      body: `You are now a ${parsed.role} for this society.`,
      kind: "team",
      linkPath: "/team",
    });

    return listTeamForTenant(claims.tenantId);
  })
  .patch("/members/:userId/role", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = changeTeamRoleSchema.parse(body);
    if (parsed.fromRole === parsed.toRole) {
      throw new AppError(400, "no_change", "Pick a different role");
    }

    const [current] = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.tenantId, claims.tenantId),
          eq(userRoles.userId, params.userId),
          eq(userRoles.role, parsed.fromRole),
          eq(userRoles.isDeleted, false),
        ),
      )
      .limit(1);
    if (!current) throw new AppError(404, "not_found", "Team member not found");

    await assertNotLastChairperson(claims.tenantId, params.userId, parsed.fromRole);

    // The unique (tenant, user, role) index means an old row may already exist.
    const [target] = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.tenantId, claims.tenantId),
          eq(userRoles.userId, params.userId),
          eq(userRoles.role, parsed.toRole),
        ),
      )
      .limit(1);

    if (target) {
      await db
        .update(userRoles)
        .set({ isDeleted: false, updatedBy: claims.sub })
        .where(eq(userRoles.id, target.id));
    } else {
      await db.insert(userRoles).values({
        id: crypto.randomUUID(),
        tenantId: claims.tenantId,
        userId: params.userId,
        role: parsed.toRole,
        createdBy: claims.sub,
        updatedBy: claims.sub,
      });
    }
    await db
      .update(userRoles)
      .set({ isDeleted: true, updatedBy: claims.sub })
      .where(eq(userRoles.id, current.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.ROLE_CHANGED,
      entityType: AuditEntity.USER,
      entityId: params.userId,
      message: `Role changed from ${parsed.fromRole} to ${parsed.toRole}`,
      meta: { fromRole: parsed.fromRole, toRole: parsed.toRole },
    });
    await notifyUser({
      tenantId: claims.tenantId,
      userId: params.userId,
      title: "Your society role changed",
      body: `You are now a ${parsed.toRole}.`,
      kind: "team",
      linkPath: "/team",
    });

    return listTeamForTenant(claims.tenantId);
  })
  .delete("/members/:userId/roles/:role", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const role = params.role as Role;
    if (!STAFF_ROLES.includes(role)) {
      throw new AppError(400, "invalid_role", "Not a society staff role");
    }

    const [current] = await db
      .select()
      .from(userRoles)
      .where(
        and(
          eq(userRoles.tenantId, claims.tenantId),
          eq(userRoles.userId, params.userId),
          eq(userRoles.role, role),
          eq(userRoles.isDeleted, false),
        ),
      )
      .limit(1);
    if (!current) throw new AppError(404, "not_found", "Team member not found");

    await assertNotLastChairperson(claims.tenantId, params.userId, role);

    await db
      .update(userRoles)
      .set({ isDeleted: true, updatedBy: claims.sub })
      .where(eq(userRoles.id, current.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.TEAM_MEMBER_REMOVED,
      entityType: AuditEntity.USER,
      entityId: params.userId,
      message: `Removed ${role} role`,
      meta: { role },
    });

    return listTeamForTenant(claims.tenantId);
  })
  .patch("/:userId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateSocietyTeamMemberSchema.parse(body);
    return updateTeamMemberInTenant(
      claims.tenantId,
      claims.sub,
      params.userId,
      parsed,
    );
  })
  .delete("/:userId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return removeTeamMemberFromTenant(
      claims.tenantId,
      claims.sub,
      params.userId,
    );
  });

/** A society must keep at least one chairperson, or nobody can administer it. */
async function assertNotLastChairperson(
  tenantId: string,
  userId: string,
  role: Role,
) {
  if (role !== "chairperson" && role !== "admin") return;
  const rows = await db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        inArray(userRoles.role, ["chairperson", "admin"]),
        eq(userRoles.isDeleted, false),
      ),
    );
  const others = rows.filter((r) => r.userId !== userId);
  if (others.length === 0) {
    throw new AppError(
      409,
      "last_chairperson",
      "A society must keep at least one chairperson",
    );
  }
}
