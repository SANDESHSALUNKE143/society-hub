import { and, eq, isNotNull, or } from "drizzle-orm";
import type { ResidentStatus, ResidentType, UserDto } from "@society-hub/types";
import { db } from "../../db/client";
import { flats, parkingSlots, residents, userRoles, users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { buildUserDto } from "../../lib/auth-context";
import { ActivityType, AuditEntity, recordAudit } from "../../lib/audit";
import {
  activeKeyFor,
  isOwnerFor,
  toMysqlDateTime,
} from "../../lib/resident-lifecycle";
import { upsertProfile } from "../profile/upsert-profile";

export type OnboardResidentInput = {
  tenantId: string;
  actorUserId: string;
  name: string;
  phone: string;
  email?: string | null;
  flatId: string;
  /** @deprecated Prefer `residentType`; kept so the CSV contract still works. */
  isOwner?: boolean;
  residentType?: ResidentType;
  isPrimary?: boolean;
  status?: ResidentStatus;
  moveInDate?: string | null;
  remarks?: string | null;
  emergencyContact?: string | null;
  vehicleNumber?: string | null;
};

export type OnboardResidentResult = {
  user: UserDto;
  /** True when a new user or new society membership/resident link was created. */
  created: boolean;
  /** True when an existing resident/user record was updated. */
  updated: boolean;
  /** `residents.id` of the membership this call created or touched. */
  residentId: string;
};

export async function onboardResidentIntoTenant(
  input: OnboardResidentInput,
): Promise<OnboardResidentResult> {
  const [flat] = await db
    .select()
    .from(flats)
    .where(
      and(
        eq(flats.id, input.flatId),
        eq(flats.tenantId, input.tenantId),
        eq(flats.isDeleted, false),
      ),
    )
    .limit(1);
  if (!flat) throw new AppError(404, "flat_not_found", "Flat not found");

  const email = input.email?.toLowerCase()?.trim() || null;
  const phone = input.phone.replace(/\D/g, "");
  const conditions = [eq(users.phone, phone)];
  if (email) conditions.push(eq(users.email, email));

  const [existing] = await db
    .select()
    .from(users)
    .where(and(eq(users.isDeleted, false), or(...conditions)))
    .limit(1);

  let userId = existing?.id;
  let created = false;
  let updated = false;

  if (!userId) {
    userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      phone,
      name: input.name,
      email,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    });
    created = true;
  } else {
    const nextEmail = email ?? existing?.email ?? null;
    const nextPhone = phone || existing?.phone || phone;
    const nameChanged = existing?.name !== input.name;
    const emailChanged = (existing?.email ?? null) !== nextEmail;
    const phoneChanged = (existing?.phone ?? null) !== nextPhone;
    if (nameChanged || emailChanged || phoneChanged) {
      await db
        .update(users)
        .set({
          name: input.name,
          email: nextEmail,
          phone: nextPhone,
          updatedBy: input.actorUserId,
        })
        .where(eq(users.id, userId));
      updated = true;
    }
  }

  const [role] = await db
    .select()
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.tenantId, input.tenantId),
        eq(userRoles.role, "resident"),
      ),
    )
    .limit(1);
  if (!role) {
    await db.insert(userRoles).values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      userId,
      role: "resident",
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    });
    created = true;
  } else if (role.isDeleted) {
    await db
      .update(userRoles)
      .set({ isDeleted: false, updatedBy: input.actorUserId })
      .where(eq(userRoles.id, role.id));
    updated = true;
  }

  const residentType: ResidentType =
    input.residentType ?? (input.isOwner === false ? "tenant" : "owner");
  const status: ResidentStatus = input.status ?? "active";
  const now = toMysqlDateTime(input.moveInDate ?? undefined);

  // The person's current occupancy in this society, if any.
  const [live] = await db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.userId, userId),
        eq(residents.tenantId, input.tenantId),
        eq(residents.isDeleted, false),
        isNotNull(residents.activeKey),
      ),
    )
    .limit(1);

  let residentId: string;
  if (live && live.flatId === input.flatId) {
    // Same flat — correct the membership in place, keeping the period open.
    residentId = live.id;
    const typeChanged = live.residentType !== residentType;
    const primaryChanged =
      input.isPrimary !== undefined && live.isPrimary !== input.isPrimary;
    const remarksChanged =
      input.remarks !== undefined && live.remarks !== input.remarks;
    if (typeChanged || primaryChanged || remarksChanged) {
      await db
        .update(residents)
        .set({
          residentType,
          isOwner: isOwnerFor(residentType),
          ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          updatedBy: input.actorUserId,
        })
        .where(eq(residents.id, live.id));
      updated = true;
    }
  } else {
    // New flat (or first ever) — close any open period, then open a new one so
    // the previous occupancy survives as history.
    if (live) {
      await db
        .update(residents)
        .set({
          status: "moved_out",
          activeKey: null,
          moveOutDate: now,
          moveOutReason: "Moved to another flat",
          updatedBy: input.actorUserId,
        })
        .where(eq(residents.id, live.id));
      await recordAudit({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: ActivityType.RESIDENT_MOVED_OUT,
        entityType: AuditEntity.RESIDENT,
        entityId: live.id,
        message: "Moved out — reassigned to another flat",
        meta: { fromFlatId: live.flatId, toFlatId: input.flatId },
      });
    }

    residentId = crypto.randomUUID();
    await db.insert(residents).values({
      id: residentId,
      tenantId: input.tenantId,
      userId,
      flatId: input.flatId,
      residentType,
      isOwner: isOwnerFor(residentType),
      isPrimary: input.isPrimary ?? true,
      status,
      verificationStatus: status === "active" ? "approved" : "pending",
      verifiedAt: status === "active" ? now : null,
      verifiedBy: status === "active" ? input.actorUserId : null,
      moveInDate: now,
      remarks: input.remarks ?? null,
      activeKey: activeKeyFor(status),
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    });
    await recordAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: ActivityType.RESIDENT_MOVED_IN,
      entityType: AuditEntity.RESIDENT,
      entityId: residentId,
      message: `Moved in as ${residentType}`,
      meta: { flatId: input.flatId, residentType, moveInDate: now },
    });
    created = true;
  }

  if (
    input.emergencyContact !== undefined ||
    input.vehicleNumber !== undefined
  ) {
    const profileChanged = await upsertProfile(input.tenantId, userId, {
      emergencyContact: input.emergencyContact,
      vehicleNumber: input.vehicleNumber,
    });
    if (profileChanged) updated = true;
  }

  // Prefer "created" when this pass introduced the membership; otherwise mark update.
  if (created) updated = false;

  if (created) {
    await recordAudit({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: ActivityType.RESIDENT_CREATED,
      entityType: AuditEntity.RESIDENT,
      entityId: residentId,
      message: `Onboarded ${input.name}`,
      meta: { flatId: input.flatId, residentType },
    });
  }

  return {
    user: await buildUserDto(userId, input.tenantId, "resident"),
    created,
    updated,
    residentId,
  };
}

/** Ensure a parking slot row exists for the flat when a slot label is set. */
export async function syncFlatParkingSlot(opts: {
  tenantId: string;
  flatId: string;
  parkingSlot: string | null | undefined;
  actorUserId: string;
}) {
  const slot = opts.parkingSlot?.trim();
  if (!slot) return;

  const [existing] = await db
    .select()
    .from(parkingSlots)
    .where(
      and(
        eq(parkingSlots.tenantId, opts.tenantId),
        eq(parkingSlots.slotNumber, slot),
        eq(parkingSlots.isDeleted, false),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(parkingSlots)
      .set({ flatId: opts.flatId, updatedBy: opts.actorUserId })
      .where(eq(parkingSlots.id, existing.id));
    return;
  }

  await db.insert(parkingSlots).values({
    id: crypto.randomUUID(),
    tenantId: opts.tenantId,
    flatId: opts.flatId,
    slotNumber: slot,
    type: "car",
    createdBy: opts.actorUserId,
    updatedBy: opts.actorUserId,
  });
}
