import { Elysia } from "elysia";
import { and, count, desc, eq, like, lt, or, sql } from "drizzle-orm";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationListQuerySchema,
} from "@society-hub/validation";
import type {
  InvitationDto,
  Paginated,
  ResidentType,
  Role,
} from "@society-hub/types";
import { env } from "../../config";
import { db } from "../../db/client";
import { flats, invitations, societies, userRoles, users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { deliverResidentInvite } from "../../lib/messaging/invite-delivery";
import { ActivityType, AuditEntity, recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import { toMysqlDateTime } from "../../lib/resident-lifecycle";
import {
  authPlugin,
  isResidentLikeRole,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";
import { onboardResidentIntoTenant } from "../admin/onboard-resident";

/**
 * Identity of an *active* invitation. Stored in `invitations.active_key` only
 * while pending, so the unique index blocks a second live invite for the same
 * recipient without constraining revoked/accepted history.
 */
export function invitationActiveKey(parts: {
  email?: string | null;
  phone?: string | null;
  role: string;
}) {
  return `${parts.email ?? ""}|${parts.phone ?? ""}|${parts.role}`.toLowerCase();
}

function toDto(
  row: typeof invitations.$inferSelect,
  flatNumber: string | null = null,
  delivery?: InvitationDto["delivery"],
): InvitationDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    flatId: row.flatId,
    flatNumber,
    residentType: row.residentType,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    revokedAt: row.revokedAt,
    lastSentAt: row.lastSentAt,
    resendCount: row.resendCount,
    createdAt: row.createdAt,
    ...(delivery ? { delivery } : {}),
    ...(env.devAuth ? { devToken: row.token } : {}),
  };
}

/**
 * Lazily flips pending invitations past their expiry to `expired` and frees
 * their active key, so a stale invite never blocks a fresh one.
 */
export async function expireStaleInvitations(tenantId: string) {
  await db
    .update(invitations)
    .set({ status: "expired", activeKey: null })
    .where(
      and(
        eq(invitations.tenantId, tenantId),
        eq(invitations.status, "pending"),
        eq(invitations.isDeleted, false),
        lt(invitations.expiresAt, toMysqlDateTime()),
      ),
    );
}

export async function createInvitationForTenant(
  tenantId: string,
  invitedBy: string,
  parsed: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    role: InvitationDto["role"];
    flatId?: string | null;
    residentType?: ResidentType | null;
    expiresInDays?: number;
    channels?: Array<"email" | "whatsapp">;
    societyName?: string;
  },
): Promise<InvitationDto> {
  if (!parsed.email && !parsed.phone) {
    throw new AppError(400, "email_or_phone_required", "Provide an email or phone");
  }

  await expireStaleInvitations(tenantId);

  const email = parsed.email?.toLowerCase().trim() || null;
  const phone = parsed.phone?.replace(/\D/g, "") || null;

  // A flat named on the invite must belong to this society.
  let flatNumber: string | null = null;
  if (parsed.flatId) {
    const [flat] = await db
      .select({ number: flats.number })
      .from(flats)
      .where(
        and(
          eq(flats.id, parsed.flatId),
          eq(flats.tenantId, tenantId),
          eq(flats.isDeleted, false),
        ),
      )
      .limit(1);
    if (!flat) throw new AppError(404, "flat_not_found", "Flat not found");
    flatNumber = flat.number;
  }

  const activeKey = invitationActiveKey({ email, phone, role: parsed.role });
  const [duplicate] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.tenantId, tenantId),
        eq(invitations.status, "pending"),
        eq(invitations.isDeleted, false),
        eq(invitations.activeKey, activeKey),
      ),
    )
    .limit(1);
  if (duplicate) {
    throw new AppError(
      409,
      "invitation_exists",
      "An active invitation already exists for this person — resend or revoke it instead",
    );
  }

  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replace(/-/g, "");
  const now = toMysqlDateTime();
  const expiresAt = toMysqlDateTime(
    new Date(Date.now() + (parsed.expiresInDays ?? 14) * 24 * 60 * 60 * 1000),
  );

  await db.insert(invitations).values({
    id,
    tenantId,
    name: parsed.name ?? null,
    email,
    phone,
    role: parsed.role,
    flatId: parsed.flatId ?? null,
    residentType: parsed.residentType ?? null,
    token,
    status: "pending",
    invitedBy,
    expiresAt,
    lastSentAt: now,
    activeKey,
    createdBy: invitedBy,
    updatedBy: invitedBy,
  });

  const delivery = await sendInvite(tenantId, token, {
    email,
    phone,
    channels: parsed.channels,
    societyName: parsed.societyName,
  });

  await recordAudit({
    tenantId,
    actorUserId: invitedBy,
    action: ActivityType.INVITATION_CREATED,
    entityType: AuditEntity.INVITATION,
    entityId: id,
    message: `Invited ${email ?? phone} as ${parsed.role}`,
    meta: { role: parsed.role, flatId: parsed.flatId ?? null, expiresAt },
  });

  const [row] = await db.select().from(invitations).where(eq(invitations.id, id)).limit(1);
  return toDto(row!, flatNumber, delivery);
}

async function sendInvite(
  tenantId: string,
  token: string,
  opts: {
    email: string | null;
    phone: string | null;
    channels?: Array<"email" | "whatsapp">;
    societyName?: string;
  },
) {
  let societyName = opts.societyName;
  if (!societyName) {
    const [society] = await db
      .select({ name: societies.name })
      .from(societies)
      .where(eq(societies.id, tenantId))
      .limit(1);
    societyName = society?.name ?? "your society";
  }

  const channels = opts.channels?.length
    ? opts.channels
    : [
        ...(opts.email ? (["email"] as const) : []),
        ...(opts.phone ? (["whatsapp"] as const) : []),
      ];

  return deliverResidentInvite({
    societyName,
    inviteToken: token,
    email: opts.email,
    phone: opts.phone,
    channels,
  });
}

export const invitationRoutes = new Elysia({ prefix: "/v1/invitations" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await expireStaleInvitations(claims.tenantId);
    const parsed = invitationListQuerySchema.parse(query ?? {});

    const filters = [
      eq(invitations.tenantId, claims.tenantId),
      eq(invitations.isDeleted, false),
    ];
    if (parsed.status) filters.push(eq(invitations.status, parsed.status));
    if (parsed.role) filters.push(eq(invitations.role, parsed.role));
    if (parsed.search?.trim()) {
      const term = `%${parsed.search.trim().toLowerCase()}%`;
      filters.push(
        or(
          like(sql`lower(${invitations.email})`, term),
          like(invitations.phone, term),
          like(sql`lower(${invitations.name})`, term),
        )!,
      );
    }
    const where = and(...filters);
    const offset = (parsed.page - 1) * parsed.limit;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({ invite: invitations, flatNumber: flats.number })
        .from(invitations)
        .leftJoin(flats, eq(flats.id, invitations.flatId))
        .where(where)
        .orderBy(desc(invitations.createdAt))
        .limit(parsed.limit)
        .offset(offset),
      db.select({ total: count() }).from(invitations).where(where),
    ]);

    const page: Paginated<InvitationDto> = {
      items: rows.map((r) => toDto(r.invite, r.flatNumber)),
      page: parsed.page,
      limit: parsed.limit,
      total: Number(totalRow?.total ?? 0),
    };
    return page;
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createInvitationSchema.parse(body);
    return createInvitationForTenant(claims.tenantId, claims.sub, parsed);
  })
  .post("/:id/resend", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const row = await getInvitationForTenant(claims.tenantId, params.id);
    if (row.status !== "pending" && row.status !== "expired") {
      throw new AppError(
        409,
        "invalid_state",
        `Cannot resend a ${row.status} invitation`,
      );
    }

    const expiresAt = toMysqlDateTime(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    await db
      .update(invitations)
      .set({
        status: "pending",
        expiresAt,
        lastSentAt: toMysqlDateTime(),
        resendCount: row.resendCount + 1,
        activeKey: invitationActiveKey(row),
        updatedBy: claims.sub,
      })
      .where(eq(invitations.id, params.id));

    const delivery = await sendInvite(claims.tenantId, row.token, {
      email: row.email,
      phone: row.phone,
    });
    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.INVITATION_RESENT,
      entityType: AuditEntity.INVITATION,
      entityId: params.id,
      message: `Resent invitation to ${row.email ?? row.phone}`,
      meta: { resendCount: row.resendCount + 1 },
    });

    const [updated] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, params.id))
      .limit(1);
    return toDto(updated!, null, delivery);
  })
  .post("/:id/revoke", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const row = await getInvitationForTenant(claims.tenantId, params.id);
    if (row.status === "accepted") {
      throw new AppError(
        409,
        "invalid_state",
        "This invitation has already been accepted",
      );
    }

    await db
      .update(invitations)
      .set({
        status: "revoked",
        revokedAt: toMysqlDateTime(),
        // Freeing the key lets an admin issue a fresh invite immediately.
        activeKey: null,
        updatedBy: claims.sub,
      })
      .where(eq(invitations.id, params.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.INVITATION_REVOKED,
      entityType: AuditEntity.INVITATION,
      entityId: params.id,
      message: `Revoked invitation to ${row.email ?? row.phone}`,
    });

    const [updated] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, params.id))
      .limit(1);
    return toDto(updated!);
  });

async function getInvitationForTenant(tenantId: string, id: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.tenantId, tenantId),
        eq(invitations.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Invitation not found");
  return row;
}

/** Unauthenticated: the invite token is the credential. */
export const invitationPublicRoutes = new Elysia({ prefix: "/v1/invites" })
  .get("/:token", async ({ params }) => {
    const row = await findPendingInvitationByToken(params.token);
    const [society] = await db
      .select({ name: societies.name })
      .from(societies)
      .where(eq(societies.id, row.tenantId))
      .limit(1);
    const [flat] = row.flatId
      ? await db
          .select({ number: flats.number })
          .from(flats)
          .where(eq(flats.id, row.flatId))
          .limit(1)
      : [];
    // Deliberately minimal — the token holder is not yet authenticated.
    return {
      societyName: society?.name ?? null,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      residentType: row.residentType,
      flatNumber: flat?.number ?? null,
      expiresAt: row.expiresAt,
    };
  })
  .post("/accept", async ({ body }) => {
    const parsed = acceptInvitationSchema.parse(body);
    const invite = await findPendingInvitationByToken(parsed.token);
    return acceptInvitation(invite, parsed);
  });

export type AcceptInvitationInput = {
  name?: string;
  phone?: string;
  email?: string | null;
};

/**
 * Turns an invitation into a real membership. Residents land in
 * `pending_verification` — an admin still has to approve them — while staff
 * invites only grant the role.
 */
export async function acceptInvitation(
  invite: typeof invitations.$inferSelect,
  input: AcceptInvitationInput,
) {
  const phone = (input.phone ?? invite.phone ?? "").replace(/\D/g, "");
  if (!phone) {
    throw new AppError(400, "phone_required", "A phone number is required to accept");
  }
  const email = (input.email ?? invite.email)?.toLowerCase().trim() || null;
  const name = input.name ?? invite.name ?? null;
  const now = toMysqlDateTime();

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.isDeleted, false)))
    .limit(1);

  let userId = existing?.id;
  if (!userId) {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      phone,
      email,
      name,
      createdBy: invite.invitedBy,
      updatedBy: invite.invitedBy,
    });
  } else if (name && existing?.name !== name) {
    await db.update(users).set({ name }).where(eq(users.id, userId));
  }

  const role = invite.role as Role;
  await ensureRole(invite.tenantId, userId, role, invite.invitedBy);

  let residentId: string | null = null;
  if (invite.flatId && isResidentLikeRole(role)) {
    const outcome = await onboardResidentIntoTenant({
      tenantId: invite.tenantId,
      actorUserId: invite.invitedBy,
      name: name ?? phone,
      phone,
      email,
      flatId: invite.flatId,
      residentType: invite.residentType ?? "owner",
      // The invitee is not trusted until an admin reviews them.
      status: "pending_verification",
    });
    residentId = outcome.residentId;
  }

  await db
    .update(invitations)
    .set({
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: userId,
      activeKey: null,
      updatedBy: userId,
    })
    .where(eq(invitations.id, invite.id));

  await recordAudit({
    tenantId: invite.tenantId,
    actorUserId: userId,
    action: ActivityType.INVITATION_ACCEPTED,
    entityType: AuditEntity.INVITATION,
    entityId: invite.id,
    message: `Invitation accepted by ${name ?? phone}`,
    meta: { role, residentId },
  });

  await notifyUser({
    tenantId: invite.tenantId,
    userId: invite.invitedBy,
    title: "Invitation accepted",
    body: `${name ?? phone} accepted your invitation.`,
    kind: "invitation",
    linkPath: residentId ? `/residents/${residentId}` : "/invites",
  });

  return {
    ok: true as const,
    userId,
    residentId,
    tenantId: invite.tenantId,
    role,
  };
}

async function ensureRole(
  tenantId: string,
  userId: string,
  role: Role,
  actorUserId: string,
) {
  const [existing] = await db
    .select()
    .from(userRoles)
    .where(
      and(
        eq(userRoles.tenantId, tenantId),
        eq(userRoles.userId, userId),
        eq(userRoles.role, role),
      ),
    )
    .limit(1);
  if (!existing) {
    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      role,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    });
    return;
  }
  if (existing.isDeleted) {
    await db
      .update(userRoles)
      .set({ isDeleted: false, updatedBy: actorUserId })
      .where(eq(userRoles.id, existing.id));
  }
}

export async function findPendingInvitationByToken(token: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.token, token),
        eq(invitations.status, "pending"),
        eq(invitations.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(404, "invite_not_found", "Invitation not found or already used");
  }
  if (row.expiresAt && row.expiresAt < toMysqlDateTime()) {
    await db
      .update(invitations)
      .set({ status: "expired", activeKey: null })
      .where(eq(invitations.id, row.id));
    throw new AppError(410, "invite_expired", "This invitation has expired");
  }
  return row;
}
