import { and, asc, eq, isNotNull, ne } from "drizzle-orm";
import type {
  ResidentStatus,
  ResidentType,
  ResidentVehicleDto,
  ResidentVehicleKind,
  UserDto,
} from "@society-hub/types";
import { vehicleParkingQuotaMessage } from "@society-hub/types";
import { db } from "../../db/client";
import {
  flats,
  parkingSlots,
  residentVehicles,
  residents,
  userRoles,
  users,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { buildUserDto } from "../../lib/auth-context";
import { ActivityType, AuditEntity, recordAudit } from "../../lib/audit";
import {
  activeKeyFor,
  toMysqlDateTime,
} from "../../lib/resident-lifecycle";
import { upsertProfile } from "../profile/upsert-profile";
import { resolveIsOwnerForFlat } from "./flat-owner";

export type OnboardVehicleInput = {
  kind: ResidentVehicleKind;
  registrationNumber?: string | null;
  parkingPurchased?: boolean;
  parkingSlot?: string | null;
};

export type OnboardResidentInput = {
  tenantId: string;
  actorUserId: string;
  name: string;
  phone: string;
  email?: string | null;
  flatId: string;
  floor?: number | null;
  parkingSlot?: string | null;
  parkingSlotId?: string | null;
  isOwner?: boolean;
  editOwner?: boolean;
  editUserId?: string;
  /** @deprecated Prefer `residentType`; kept so the CSV contract still works. */
  residentType?: ResidentType;
  isPrimary?: boolean;
  status?: ResidentStatus;
  moveInDate?: string | null;
  remarks?: string | null;
  emergencyContact?: string | null;
  vehicleNumber?: string | null;
  vehicles?: OnboardVehicleInput[];
  pngGasConnection?: boolean;
  adultCount?: number;
  childCount?: number;
  seniorCitizenCount?: number;
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

  await syncFlatOnboardFields({
    tenantId: input.tenantId,
    flat,
    floor: input.floor,
    parkingSlot: input.parkingSlot,
    parkingSlotId: input.parkingSlotId,
    pngGasConnection: input.pngGasConnection,
    adultCount: input.adultCount,
    childCount: input.childCount,
    seniorCitizenCount: input.seniorCitizenCount,
    actorUserId: input.actorUserId,
  });

  const email = input.email?.toLowerCase()?.trim() || null;
  const phone = input.phone.replace(/\D/g, "");

  const [currentOwner] = await db
    .select({ userId: residents.userId })
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, input.tenantId),
        eq(residents.flatId, input.flatId),
        eq(residents.isDeleted, false),
        eq(residents.isOwner, true),
      ),
    )
    .orderBy(asc(residents.createdAt), asc(residents.id))
    .limit(1);

  let userId: string | undefined;
  let created = false;
  let updated = false;

  if (input.editUserId && !input.editOwner) {
    const [link] = await db
      .select()
      .from(residents)
      .where(
        and(
          eq(residents.tenantId, input.tenantId),
          eq(residents.userId, input.editUserId),
          eq(residents.flatId, input.flatId),
          eq(residents.isDeleted, false),
        ),
      )
      .limit(1);
    if (!link) {
      throw new AppError(404, "resident_not_found", "Family member not found on this flat");
    }
    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, input.editUserId), eq(users.isDeleted, false)))
      .limit(1);
    if (!target) {
      throw new AppError(404, "resident_not_found", "Family member not found on this flat");
    }
    const [phoneUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.isDeleted, false)))
      .limit(1);
    if (phoneUser && phoneUser.id !== target.id) {
      throw new AppError(
        409,
        "phone_taken",
        "This mobile is already used by another person.",
      );
    }
    if (email) {
      const [emailOwner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), eq(users.isDeleted, false)))
        .limit(1);
      if (emailOwner && emailOwner.id !== target.id) {
        throw new AppError(
          409,
          "email_taken",
          "This email is already used by another person. Family members each need their own email, or leave it blank.",
        );
      }
    }
    userId = target.id;
    const nameChanged = target.name !== input.name;
    const emailChanged = (target.email ?? null) !== email;
    const phoneChanged = (target.phone ?? null) !== phone;
    if (nameChanged || emailChanged || phoneChanged) {
      await db
        .update(users)
        .set({
          name: input.name,
          email,
          phone,
          updatedBy: input.actorUserId,
        })
        .where(eq(users.id, userId));
      updated = true;
    }
  } else if (input.editOwner) {
    if (!currentOwner) {
      throw new AppError(
        400,
        "owner_required",
        "This flat has no owner to edit",
      );
    }
    const [ownerUser] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, currentOwner.userId), eq(users.isDeleted, false)))
      .limit(1);
    if (!ownerUser) {
      throw new AppError(404, "owner_not_found", "Owner account was not found");
    }
    const [phoneUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.isDeleted, false)))
      .limit(1);
    if (phoneUser && phoneUser.id !== ownerUser.id) {
      throw new AppError(
        409,
        "phone_taken",
        "This mobile is already used by another person.",
      );
    }
    if (email) {
      const [emailOwner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), eq(users.isDeleted, false)))
        .limit(1);
      if (emailOwner && emailOwner.id !== ownerUser.id) {
        throw new AppError(
          409,
          "email_taken",
          "This email is already used by another person. Family members each need their own email, or leave it blank.",
        );
      }
    }
    userId = ownerUser.id;
    const nameChanged = ownerUser.name !== input.name;
    const emailChanged = (ownerUser.email ?? null) !== email;
    const phoneChanged = (ownerUser.phone ?? null) !== phone;
    if (nameChanged || emailChanged || phoneChanged) {
      await db
        .update(users)
        .set({
          name: input.name,
          email,
          phone,
          updatedBy: input.actorUserId,
        })
        .where(eq(users.id, userId));
      updated = true;
    }
  } else {
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.isDeleted, false)))
      .limit(1);

    if (email) {
      const [emailOwner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, email), eq(users.isDeleted, false)))
        .limit(1);
      if (emailOwner && emailOwner.id !== existing?.id) {
        throw new AppError(
          409,
          "email_taken",
          "This email is already used by another person. Family members each need their own email, or leave it blank.",
        );
      }
    }

    userId = existing?.id;
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
  }

  if (!userId) {
    throw new AppError(500, "user_required", "Could not resolve the resident account");
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

  const isOwner = input.editOwner
    ? true
    : resolveIsOwnerForFlat({
        requested: input.isOwner,
        existingOwnerUserId: currentOwner?.userId ?? null,
        userId,
      });
  const residentType: ResidentType =
    input.residentType ?? (isOwner ? "owner" : "family");
  const status: ResidentStatus = input.status ?? "active";
  const now = toMysqlDateTime(input.moveInDate ?? undefined);

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
    residentId = live.id;
    const typeChanged =
      live.residentType !== residentType || live.isOwner !== isOwner;
    const primaryChanged =
      input.isPrimary !== undefined && live.isPrimary !== input.isPrimary;
    const remarksChanged =
      input.remarks !== undefined && live.remarks !== input.remarks;
    if (typeChanged || primaryChanged || remarksChanged) {
      await db
        .update(residents)
        .set({
          residentType,
          isOwner,
          ...(input.isPrimary !== undefined ? { isPrimary: input.isPrimary } : {}),
          ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
          updatedBy: input.actorUserId,
        })
        .where(eq(residents.id, live.id));
      updated = true;
    }
  } else {
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
      isOwner,
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

  const vehicles = resolveOnboardVehicles(input);
  const primaryPlate =
    vehicles !== undefined
      ? (primaryVehicleNumber(vehicles) ?? null)
      : input.vehicleNumber;
  if (
    input.emergencyContact !== undefined ||
    primaryPlate !== undefined
  ) {
    const profileChanged = await upsertProfile(input.tenantId, userId, {
      emergencyContact: input.emergencyContact,
      vehicleNumber: primaryPlate,
    });
    if (profileChanged) updated = true;
  }

  if (vehicles !== undefined) {
    await assertHouseholdVehicleQuota({
      tenantId: input.tenantId,
      flatId: input.flatId,
      userId,
      incoming: vehicles,
    });
    const vehiclesChanged = await replaceResidentVehicles({
      tenantId: input.tenantId,
      userId,
      actorUserId: input.actorUserId,
      vehicles,
    });
    if (vehiclesChanged) updated = true;
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
  parkingSlotId?: string | null;
  actorUserId: string;
}) {
  const slot = opts.parkingSlot?.trim();
  const parkingSlotId = opts.parkingSlotId?.trim();
  if (!slot && !parkingSlotId) return;

  if (parkingSlotId) {
    const [byId] = await db
      .select()
      .from(parkingSlots)
      .where(
        and(
          eq(parkingSlots.id, parkingSlotId),
          eq(parkingSlots.tenantId, opts.tenantId),
          eq(parkingSlots.isDeleted, false),
        ),
      )
      .limit(1);
    if (byId) {
      await db
        .update(parkingSlots)
        .set({ flatId: opts.flatId, updatedBy: opts.actorUserId })
        .where(eq(parkingSlots.id, byId.id));
      return;
    }
  }

  if (!slot) return;

  const matches = await db
    .select()
    .from(parkingSlots)
    .where(
      and(eq(parkingSlots.tenantId, opts.tenantId), eq(parkingSlots.isDeleted, false)),
    );
  const sameNumber = matches.filter(
    (row) => row.slotNumber.trim().toLowerCase() === slot.toLowerCase(),
  );
  const existing =
    sameNumber.find((row) => row.flatId === opts.flatId) ??
    sameNumber.find((row) => !row.flatId) ??
    sameNumber[0];

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

function resolveOnboardVehicles(
  input: OnboardResidentInput,
): OnboardVehicleInput[] | undefined {
  if (input.vehicles !== undefined) {
    return input.vehicles.map((v) => {
      const plate = v.registrationNumber?.trim();
      return {
        ...v,
        registrationNumber: plate ? plate.toUpperCase() : null,
      };
    });
  }
  const plate = input.vehicleNumber?.trim();
  if (!plate) return undefined;
  return [
    {
      kind: "four_wheeler",
      registrationNumber: plate,
      parkingPurchased: false,
    },
  ];
}

export async function assertHouseholdVehicleQuota(opts: {
  tenantId: string;
  flatId: string;
  userId: string;
  incoming: OnboardVehicleInput[];
}) {
  if (!opts.incoming.length) return;
  const others = await db
    .select({
      kind: residentVehicles.kind,
      parkingPurchased: residentVehicles.parkingPurchased,
    })
    .from(residentVehicles)
    .innerJoin(
      residents,
      and(
        eq(residents.userId, residentVehicles.userId),
        eq(residents.tenantId, residentVehicles.tenantId),
      ),
    )
    .where(
      and(
        eq(residentVehicles.tenantId, opts.tenantId),
        eq(residents.flatId, opts.flatId),
        eq(residentVehicles.isDeleted, false),
        eq(residents.isDeleted, false),
        ne(residents.userId, opts.userId),
      ),
    )
    .orderBy(asc(residentVehicles.sortOrder));
  const combined = [
    ...others.map((row) => ({
      kind: row.kind as ResidentVehicleKind,
      parkingPurchased: Boolean(row.parkingPurchased),
    })),
    ...opts.incoming,
  ];
  const message = vehicleParkingQuotaMessage(combined);
  if (message) {
    throw new AppError(
      400,
      "parking_quota",
      `${message}. Included parking is per flat, across all family members.`,
    );
  }
}

export function primaryVehicleNumber(vehicles: OnboardVehicleInput[] | undefined) {
  if (!vehicles?.length) return undefined;
  const withPlate = (v: OnboardVehicleInput) =>
    Boolean(v.registrationNumber?.trim());
  const four = vehicles.find((v) => v.kind === "four_wheeler" && withPlate(v));
  const any = vehicles.find(withPlate);
  return (four ?? any)?.registrationNumber ?? null;
}

export async function syncFlatOnboardFields(opts: {
  tenantId: string;
  flat: typeof flats.$inferSelect;
  floor?: number | null;
  parkingSlot?: string | null;
  parkingSlotId?: string | null;
  pngGasConnection?: boolean;
  adultCount?: number;
  childCount?: number;
  seniorCitizenCount?: number;
  actorUserId: string;
}) {
  const nextFloor = opts.floor !== undefined ? opts.floor : opts.flat.floor;
  const nextParking =
    opts.parkingSlot !== undefined ? opts.parkingSlot : opts.flat.parkingSlot;
  const nextPng =
    opts.pngGasConnection !== undefined
      ? opts.pngGasConnection
      : Boolean(opts.flat.pngGasConnection);
  const nextAdults =
    opts.adultCount !== undefined ? opts.adultCount : opts.flat.adultCount;
  const nextChildren =
    opts.childCount !== undefined ? opts.childCount : opts.flat.childCount;
  const nextSeniors =
    opts.seniorCitizenCount !== undefined
      ? opts.seniorCitizenCount
      : opts.flat.seniorCitizenCount;
  const floorChanged = nextFloor !== opts.flat.floor;
  const parkingChanged = (nextParking ?? null) !== (opts.flat.parkingSlot ?? null);
  const pngChanged = nextPng !== Boolean(opts.flat.pngGasConnection);
  const familyChanged =
    nextAdults !== opts.flat.adultCount ||
    nextChildren !== opts.flat.childCount ||
    nextSeniors !== opts.flat.seniorCitizenCount;
  if (
    !floorChanged &&
    !parkingChanged &&
    !opts.parkingSlotId &&
    !pngChanged &&
    !familyChanged
  ) {
    return;
  }

  await db
    .update(flats)
    .set({
      floor: nextFloor ?? null,
      parkingSlot: nextParking ?? null,
      pngGasConnection: nextPng,
      adultCount: nextAdults,
      childCount: nextChildren,
      seniorCitizenCount: nextSeniors,
      updatedBy: opts.actorUserId,
    })
    .where(eq(flats.id, opts.flat.id));
  if (parkingChanged || opts.parkingSlotId) {
    await syncFlatParkingSlot({
      tenantId: opts.tenantId,
      flatId: opts.flat.id,
      parkingSlot: nextParking,
      parkingSlotId: opts.parkingSlotId,
      actorUserId: opts.actorUserId,
    });
  }
}

export async function listResidentVehicles(
  tenantId: string,
  userId: string,
): Promise<ResidentVehicleDto[]> {
  const rows = await db
    .select({
      kind: residentVehicles.kind,
      registrationNumber: residentVehicles.registrationNumber,
      parkingPurchased: residentVehicles.parkingPurchased,
      parkingSlot: residentVehicles.parkingSlot,
    })
    .from(residentVehicles)
    .where(
      and(
        eq(residentVehicles.tenantId, tenantId),
        eq(residentVehicles.userId, userId),
        eq(residentVehicles.isDeleted, false),
      ),
    )
    .orderBy(asc(residentVehicles.sortOrder), asc(residentVehicles.createdAt));
  return rows
    .map((row) => ({
      kind: row.kind as ResidentVehicleKind,
      registrationNumber: row.registrationNumber,
      parkingPurchased: Boolean(row.parkingPurchased),
      parkingSlot: row.parkingSlot ?? null,
    }));
}

export async function replaceResidentVehicles(opts: {
  tenantId: string;
  userId: string;
  actorUserId: string;
  vehicles: OnboardVehicleInput[];
}): Promise<boolean> {
  const existing = await db
    .select()
    .from(residentVehicles)
    .where(
      and(
        eq(residentVehicles.tenantId, opts.tenantId),
        eq(residentVehicles.userId, opts.userId),
        eq(residentVehicles.isDeleted, false),
      ),
    )
    .orderBy(asc(residentVehicles.sortOrder));

  const nextKey = (v: OnboardVehicleInput) =>
    `${v.kind}|${(v.registrationNumber?.trim() ?? "").toUpperCase()}|${Boolean(v.parkingPurchased)}|${v.parkingSlot?.trim() ?? ""}`;
  const currentKey = (row: (typeof existing)[number]) =>
    `${row.kind}|${row.registrationNumber ?? ""}|${Boolean(row.parkingPurchased)}|${row.parkingSlot ?? ""}`;

  const same =
    existing.length === opts.vehicles.length &&
    existing.every((row, i) => nextKey(opts.vehicles[i]!) === currentKey(row));
  if (same) return false;

  if (existing.length) {
    await db
      .update(residentVehicles)
      .set({ isDeleted: true, updatedBy: opts.actorUserId })
      .where(
        and(
          eq(residentVehicles.tenantId, opts.tenantId),
          eq(residentVehicles.userId, opts.userId),
          eq(residentVehicles.isDeleted, false),
        ),
      );
  }

  if (!opts.vehicles.length) return existing.length > 0;

  await db.insert(residentVehicles).values(
    opts.vehicles.map((v, i) => ({
      id: crypto.randomUUID(),
      tenantId: opts.tenantId,
      userId: opts.userId,
      kind: v.kind,
      registrationNumber: v.registrationNumber?.trim()
        ? v.registrationNumber.trim().toUpperCase()
        : null,
      parkingPurchased: Boolean(v.parkingPurchased),
      parkingSlot: v.parkingSlot?.trim() || null,
      sortOrder: i,
      createdBy: opts.actorUserId,
      updatedBy: opts.actorUserId,
    })),
  );
  return true;
}
