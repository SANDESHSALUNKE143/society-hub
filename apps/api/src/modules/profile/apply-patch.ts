import { and, count, eq } from "drizzle-orm";
import type { z } from "zod";
import type { updateResidentProfileSchema } from "@society-hub/validation";
import { db } from "../../db/client";
import { flats, residentVehicles, residents } from "../../db/schema";
import { AppError } from "../../lib/errors";
import {
  assertHouseholdVehicleQuota,
  primaryVehicleNumber,
  replaceResidentVehicles,
  syncFlatOnboardFields,
  type OnboardVehicleInput,
} from "../admin/onboard-resident";
import { upsertProfile } from "./upsert-profile";

type ProfilePatch = z.infer<typeof updateResidentProfileSchema>;

export async function applyResidentProfilePatch(
  tenantId: string,
  userId: string,
  patch: ProfilePatch,
) {
  const [resident] = await db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, tenantId),
        eq(residents.userId, userId),
        eq(residents.isDeleted, false),
      ),
    )
    .limit(1);

  const touchesHousehold =
    patch.pngGasConnection !== undefined ||
    patch.adultCount !== undefined ||
    patch.childCount !== undefined ||
    patch.seniorCitizenCount !== undefined ||
    patch.vehicles !== undefined;

  if (touchesHousehold && !resident) {
    throw new AppError(
      400,
      "no_flat",
      "Ask an admin to onboard you to a flat before updating PNG, family counts, or vehicles.",
    );
  }

  const incomingVehicles: OnboardVehicleInput[] | undefined = patch.vehicles?.map(
    (v) => ({
      kind: v.kind,
      registrationNumber: v.registrationNumber,
      parkingPurchased: v.parkingPurchased,
      parkingSlot: v.parkingSlot,
    }),
  );

  if (incomingVehicles !== undefined && resident) {
    await assertHouseholdVehicleQuota({
      tenantId,
      flatId: resident.flatId,
      userId,
      incoming: incomingVehicles,
    });
    await replaceResidentVehicles({
      tenantId,
      userId,
      actorUserId: userId,
      vehicles: incomingVehicles,
    });
  }

  if (
    resident &&
    (patch.pngGasConnection !== undefined ||
      patch.adultCount !== undefined ||
      patch.childCount !== undefined ||
      patch.seniorCitizenCount !== undefined)
  ) {
    const [flat] = await db
      .select()
      .from(flats)
      .where(and(eq(flats.id, resident.flatId), eq(flats.isDeleted, false)))
      .limit(1);
    if (flat) {
      await syncFlatOnboardFields({
        tenantId,
        flat,
        pngGasConnection: patch.pngGasConnection,
        adultCount: patch.adultCount,
        childCount: patch.childCount,
        seniorCitizenCount: patch.seniorCitizenCount,
        actorUserId: userId,
      });
    }
  }

  const vehicleNumber =
    incomingVehicles !== undefined
      ? (primaryVehicleNumber(incomingVehicles) ?? null)
      : patch.vehicleNumber;

  if (
    patch.emergencyContact !== undefined ||
    vehicleNumber !== undefined
  ) {
    await upsertProfile(tenantId, userId, {
      emergencyContact: patch.emergencyContact,
      vehicleNumber,
    });
  }
}

export async function vehicleCountsForFlat(
  tenantId: string,
  flatId: string,
): Promise<{ twoWheelerCount: number; fourWheelerCount: number }> {
  const rows = await db
    .select({
      kind: residentVehicles.kind,
      n: count(),
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
        eq(residentVehicles.tenantId, tenantId),
        eq(residents.flatId, flatId),
        eq(residentVehicles.isDeleted, false),
        eq(residents.isDeleted, false),
      ),
    )
    .groupBy(residentVehicles.kind);
  const out = { twoWheelerCount: 0, fourWheelerCount: 0 };
  for (const row of rows) {
    if (row.kind === "two_wheeler") out.twoWheelerCount = Number(row.n);
    if (row.kind === "four_wheeler") out.fourWheelerCount = Number(row.n);
  }
  return out;
}
