import { and, desc, eq, or, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { auditLogs, societies, users } from "../db/schema";

/** Unique action types — prefer one per meaningful mutation (Fassport EEventType style). */
export const ActivityType = {
  USER_PASSWORD_LOGIN: "user.password_login",
  USER_OTP_LOGIN: "user.otp_login",
  USER_PIN_LOGIN: "user.pin_login",
  USER_GOOGLE_LOGIN: "user.google_login",
  SOCIETY_CREATED: "society.created",
  SOCIETY_TEAM_MEMBER_ADDED: "society.team_member_added",
  COMPLAINT_CREATED: "complaint.created",
  COMPLAINT_STATUS_CHANGED: "complaint.status_changed",
  COMPLAINT_COMMENT_ADDED: "complaint.comment_added",
  BILL_GENERATED: "bill.generated",
  BILL_VOIDED: "bill.voided",
  BILL_CORRECTED: "bill.corrected",
  PAYMENT_RECORDED: "payment.recorded",
  NOTICE_PUBLISHED: "notice.published",

  // Society & Resident Management 2.0 (Phase 1)
  RESIDENT_CREATED: "resident.created",
  RESIDENT_UPDATED: "resident.updated",
  RESIDENT_VERIFIED: "resident.verified",
  RESIDENT_REJECTED: "resident.rejected",
  RESIDENT_SUSPENDED: "resident.suspended",
  RESIDENT_REACTIVATED: "resident.reactivated",
  RESIDENT_MOVED_IN: "resident.moved_in",
  RESIDENT_MOVED_OUT: "resident.moved_out",
  RESIDENT_FAMILY_ADDED: "resident.family_added",
  RESIDENT_FAMILY_REMOVED: "resident.family_removed",
  DOCUMENT_UPLOADED: "document.uploaded",
  DOCUMENT_VIEWED: "document.viewed",
  DOCUMENT_VERIFIED: "document.verified",
  DOCUMENT_REJECTED: "document.rejected",
  INVITATION_CREATED: "invitation.created",
  INVITATION_RESENT: "invitation.resent",
  INVITATION_REVOKED: "invitation.revoked",
  INVITATION_ACCEPTED: "invitation.accepted",
  TEAM_MEMBER_ADDED: "team.member_added",
  TEAM_MEMBER_REMOVED: "team.member_removed",
  ROLE_CHANGED: "role.changed",
} as const;

/** Entity types used by resident-management audit rows. */
export const AuditEntity = {
  RESIDENT: "resident",
  DOCUMENT: "resident_document",
  FAMILY_MEMBER: "resident_family_member",
  INVITATION: "invitation",
  USER: "user",
} as const;

export type ActivityTypeValue = (typeof ActivityType)[keyof typeof ActivityType];

export type RecordAuditInput = {
  tenantId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  message?: string;
  meta?: unknown;
};

/** Appends an audit / activity trail row (Fassport Event.create equivalent). */
export async function recordAudit(input: RecordAuditInput) {
  await db.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: input.action,
    message: input.message ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    meta: input.meta === undefined ? null : JSON.stringify(input.meta),
    createdBy: input.actorUserId,
    updatedBy: input.actorUserId,
  });
}

/**
 * Fire-and-forget activity write — never blocks the mutation response.
 * Errors are swallowed after console.warn (same spirit as Fassport Event.create).
 */
export function recordActivity(input: RecordAuditInput) {
  void recordAudit(input).catch((err) => {
    console.warn("[activity] failed to record", input.action, err);
  });
}

export type ActivityRow = {
  id: string;
  tenantId: string;
  societyName: string | null;
  actorUserId: string;
  actorName: string | null;
  action: string;
  message: string | null;
  entityType: string;
  entityId: string;
  meta: string | null;
  createdAt: string;
};

/** Events where the user is actor OR the entity subject (user history). */
export async function listUserActivity(
  userId: string,
  limit = 100,
): Promise<ActivityRow[]> {
  const rows = await db
    .select({
      id: auditLogs.id,
      tenantId: auditLogs.tenantId,
      societyName: societies.name,
      actorUserId: auditLogs.actorUserId,
      actorName: users.name,
      action: auditLogs.action,
      message: auditLogs.message,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(societies, eq(societies.id, auditLogs.tenantId))
    .where(
      and(
        eq(auditLogs.isDeleted, false),
        or(
          eq(auditLogs.actorUserId, userId),
          and(eq(auditLogs.entityType, "user"), eq(auditLogs.entityId, userId)),
        ),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return rows;
}

/**
 * Activity for one entity within one society — powers the resident detail
 * Activity/Audit tab. Tenant-scoped: a caller can never read another society's
 * trail even if they guess an entity id.
 */
export async function listEntityActivity(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<ActivityRow[]> {
  return db
    .select({
      id: auditLogs.id,
      tenantId: auditLogs.tenantId,
      societyName: societies.name,
      actorUserId: auditLogs.actorUserId,
      actorName: users.name,
      action: auditLogs.action,
      message: auditLogs.message,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(societies, eq(societies.id, auditLogs.tenantId))
    .where(
      and(
        eq(auditLogs.isDeleted, false),
        eq(auditLogs.tenantId, tenantId),
        eq(auditLogs.entityType, entityType),
        eq(auditLogs.entityId, entityId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/** Platform-wide recent activity (Manage Audit / Dashboard). */
export async function listPlatformActivity(limit = 100): Promise<ActivityRow[]> {
  const rows = await db
    .select({
      id: auditLogs.id,
      tenantId: auditLogs.tenantId,
      societyName: societies.name,
      actorUserId: auditLogs.actorUserId,
      actorName: users.name,
      action: auditLogs.action,
      message: auditLogs.message,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      meta: auditLogs.meta,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .leftJoin(societies, eq(societies.id, auditLogs.tenantId))
    .where(eq(auditLogs.isDeleted, false))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
  return rows;
}

export async function latestActivityAtForUsers(
  userIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({
      actorUserId: auditLogs.actorUserId,
      createdAt: sql<string>`MAX(${auditLogs.createdAt})`.as("created_at"),
    })
    .from(auditLogs)
    .where(
      and(eq(auditLogs.isDeleted, false), inArray(auditLogs.actorUserId, userIds)),
    )
    .groupBy(auditLogs.actorUserId);
  for (const row of rows) {
    map.set(row.actorUserId, row.createdAt);
  }
  return map;
}
