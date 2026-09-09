import { and, asc, eq, ne } from "drizzle-orm";
import type { ResidentVehicleDto, ResidentVehicleKind, UserDto } from "@society-hub/types";
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
import { upsertProfile } from "../profile/upsert-profile";

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
  isOwner?: boolean;
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
    pngGasConnection: input.pngGasConnection,
    adultCount: input.adultCount,
    childCount: input.childCount,
    seniorCitizenCount: input.seniorCitizenCount,
    actorUserId: input.actorUserId,
  });

  const email = input.email?.toLowerCase()?.trim() || null;
  const phone = input.phone.replace(/\D/g, "");

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

  const [res] = await db
    .select()
    .from(residents)
    .where(
      and(eq(residents.userId, userId), eq(residents.tenantId, input.tenantId)),
    )
    .limit(1);

  const isOwner = input.isOwner ?? true;
  if (!res) {
    await db.insert(residents).values({
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      userId,
      flatId: input.flatId,
      isOwner,
      createdBy: input.actorUserId,
      updatedBy: input.actorUserId,
    });
    created = true;
  } else {
    const flatChanged = res.flatId !== input.flatId;
    const ownerChanged = res.isOwner !== isOwner;
    const wasDeleted = res.isDeleted;
    if (flatChanged || ownerChanged || wasDeleted) {
      await db
        .update(residents)
        .set({
          flatId: input.flatId,
          isOwner,
          isDeleted: false,
          updatedBy: input.actorUserId,
        })
        .where(eq(residents.id, res.id));
      updated = true;
    }
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

  return {
    user: await buildUserDto(userId, input.tenantId, "resident"),
    created,
    updated,
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
  if (!floorChanged && !parkingChanged && !pngChanged && !familyChanged) return;

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
  if (parkingChanged) {
    await syncFlatParkingSlot({
      tenantId: opts.tenantId,
      flatId: opts.flat.id,
      parkingSlot: nextParking,
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
