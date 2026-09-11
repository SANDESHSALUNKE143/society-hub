import { and, eq } from "drizzle-orm";
import type { ResidentStatus, ResidentType } from "@society-hub/types";
import { db } from "../../db/client";
import { flats, residents, users } from "../../db/schema";
import { ActivityType, AuditEntity, recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import {
  activeKeyFor,
  assertTransition,
  isOwnerFor,
  toMysqlDateTime,
} from "../../lib/resident-lifecycle";
import { getResidentRow } from "./repository";

/** Flat number for audit/notification copy; null when the flat is gone. */
async function flatNumberFor(tenantId: string, flatId: string) {
  const [flat] = await db
    .select({ number: flats.number })
    .from(flats)
    .where(and(eq(flats.id, flatId), eq(flats.tenantId, tenantId)))
    .limit(1);
  return flat?.number ?? null;
}

/** Closes an occupancy period. The row is kept — only the period ends. */
export async function closeMembership(opts: {
  tenantId: string;
  actorUserId: string;
  residentId: string;
  moveOutDate?: string | null;
  reason?: string | null;
  remarks?: string | null;
  notify?: boolean;
}) {
  const row = await getResidentRow(opts.tenantId, opts.residentId);
  assertTransition(row.status, "moved_out");

  const moveOutDate = toMysqlDateTime(opts.moveOutDate ?? undefined);
  await db
    .update(residents)
    .set({
      status: "moved_out",
      activeKey: null,
      moveOutDate,
      moveOutReason: opts.reason ?? null,
      remarks: opts.remarks ?? row.remarks,
      updatedBy: opts.actorUserId,
    })
    .where(eq(residents.id, opts.residentId));

  const flatNumber = await flatNumberFor(opts.tenantId, row.flatId);
  await recordAudit({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    action: ActivityType.RESIDENT_MOVED_OUT,
    entityType: AuditEntity.RESIDENT,
    entityId: opts.residentId,
    message: `Moved out of flat ${flatNumber ?? row.flatId}${
      opts.reason ? ` — ${opts.reason}` : ""
    }`,
    meta: { flatId: row.flatId, moveOutDate, reason: opts.reason ?? null },
  });

  if (opts.notify !== false) {
    await notifyUser({
      tenantId: opts.tenantId,
      userId: row.userId,
      title: "Move-out recorded",
      body: `Your membership for flat ${flatNumber ?? ""} has been closed.`.trim(),
      kind: "resident",
      linkPath: "/account",
    });
  }
  return row;
}

/** Approve / reject verification, and move the membership status with it. */
export async function setVerification(opts: {
  tenantId: string;
  actorUserId: string;
  residentId: string;
  approved: boolean;
  reason?: string | null;
}) {
  const row = await getResidentRow(opts.tenantId, opts.residentId);
  const nextStatus: ResidentStatus = opts.approved ? "active" : "rejected";
  if (row.status !== nextStatus) assertTransition(row.status, nextStatus);

  const now = toMysqlDateTime();
  await db
    .update(residents)
    .set({
      verificationStatus: opts.approved ? "approved" : "rejected",
      status: nextStatus,
      activeKey: activeKeyFor(nextStatus),
      verifiedBy: opts.actorUserId,
      verifiedAt: now,
      rejectionReason: opts.approved ? null : (opts.reason ?? null),
      updatedBy: opts.actorUserId,
    })
    .where(eq(residents.id, opts.residentId));

  await recordAudit({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    action: opts.approved
      ? ActivityType.RESIDENT_VERIFIED
      : ActivityType.RESIDENT_REJECTED,
    entityType: AuditEntity.RESIDENT,
    entityId: opts.residentId,
    message: opts.approved
      ? "Verification approved"
      : `Verification rejected — ${opts.reason ?? "no reason given"}`,
    // Reason is an admin-authored note, never document content.
    meta: { reason: opts.approved ? null : (opts.reason ?? null) },
  });

  await notifyUser({
    tenantId: opts.tenantId,
    userId: row.userId,
    title: opts.approved ? "Verification approved" : "Verification rejected",
    body: opts.approved
      ? "Your society membership has been verified."
      : `Your verification was rejected. Reason: ${opts.reason ?? "not provided"}`,
    kind: "verification",
    linkPath: "/account",
  });

  return row;
}

export async function setSuspension(opts: {
  tenantId: string;
  actorUserId: string;
  residentId: string;
  suspend: boolean;
  reason?: string | null;
}) {
  const row = await getResidentRow(opts.tenantId, opts.residentId);
  const nextStatus: ResidentStatus = opts.suspend ? "suspended" : "active";
  assertTransition(row.status, nextStatus);

  await db
    .update(residents)
    .set({
      status: nextStatus,
      activeKey: activeKeyFor(nextStatus),
      remarks: opts.reason ?? row.remarks,
      updatedBy: opts.actorUserId,
    })
    .where(eq(residents.id, opts.residentId));

  await recordAudit({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    action: opts.suspend
      ? ActivityType.RESIDENT_SUSPENDED
      : ActivityType.RESIDENT_REACTIVATED,
    entityType: AuditEntity.RESIDENT,
    entityId: opts.residentId,
    message: opts.suspend
      ? `Suspended${opts.reason ? ` — ${opts.reason}` : ""}`
      : "Reactivated",
    meta: { reason: opts.reason ?? null },
  });

  await notifyUser({
    tenantId: opts.tenantId,
    userId: row.userId,
    title: opts.suspend ? "Membership suspended" : "Membership reactivated",
    body: opts.suspend
      ? `Your society membership has been suspended.${opts.reason ? ` Reason: ${opts.reason}` : ""}`
      : "Your society membership is active again.",
    kind: "resident",
    linkPath: "/account",
  });

  return row;
}

/** Editable membership fields. Verification state is never changed here. */
export async function updateResident(opts: {
  tenantId: string;
  actorUserId: string;
  residentId: string;
  patch: {
    name?: string;
    phone?: string;
    email?: string | null;
    residentType?: ResidentType;
    isPrimary?: boolean;
    moveInDate?: string | null;
    remarks?: string | null;
  };
}) {
  const row = await getResidentRow(opts.tenantId, opts.residentId);
  const { patch } = opts;

  const membershipPatch: Partial<typeof residents.$inferInsert> = {};
  if (patch.residentType !== undefined) {
    membershipPatch.residentType = patch.residentType;
    membershipPatch.isOwner = isOwnerFor(patch.residentType);
  }
  if (patch.isPrimary !== undefined) membershipPatch.isPrimary = patch.isPrimary;
  if (patch.moveInDate !== undefined) {
    membershipPatch.moveInDate = patch.moveInDate
      ? toMysqlDateTime(patch.moveInDate)
      : null;
  }
  if (patch.remarks !== undefined) membershipPatch.remarks = patch.remarks;

  if (Object.keys(membershipPatch).length > 0) {
    membershipPatch.updatedBy = opts.actorUserId;
    await db
      .update(residents)
      .set(membershipPatch)
      .where(eq(residents.id, opts.residentId));
  }

  const userPatch: Partial<typeof users.$inferInsert> = {};
  if (patch.name !== undefined) userPatch.name = patch.name;
  if (patch.phone !== undefined) userPatch.phone = patch.phone.replace(/\D/g, "");
  if (patch.email !== undefined) {
    userPatch.email = patch.email ? patch.email.toLowerCase().trim() : null;
  }
  if (Object.keys(userPatch).length > 0) {
    userPatch.updatedBy = opts.actorUserId;
    await db.update(users).set(userPatch).where(eq(users.id, row.userId));
  }

  await recordAudit({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    action: ActivityType.RESIDENT_UPDATED,
    entityType: AuditEntity.RESIDENT,
    entityId: opts.residentId,
    message: "Resident details updated",
    meta: { fields: Object.keys(patch) },
  });

  return row;
}
