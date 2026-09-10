import { and, asc, eq } from "drizzle-orm";
import type { ParkingSlotDto, SocietyFlatImportResultDto } from "@society-hub/types";
import { db } from "../../db/client";
import { flats, parkingSlots, societies } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { softDelete } from "../../lib/soft-delete";
import {
  normalizeSocietyParking,
  parkingIdentitiesMatch,
  parkingTakenMessage,
  slotNumbersMatch,
} from "./parking-helpers";

async function requireSociety(societyId: string) {
  const [society] = await db
    .select({ id: societies.id })
    .from(societies)
    .where(and(eq(societies.id, societyId), eq(societies.isDeleted, false)))
    .limit(1);
  if (!society) throw new AppError(404, "not_found", "Society not found");
}

export function toParkingSlotDto(
  row: typeof parkingSlots.$inferSelect,
  flatNumber: string | null,
): ParkingSlotDto {
  return {
    id: row.id,
    flatId: row.flatId,
    flatNumber,
    slotNumber: row.slotNumber,
    vehicleNumber: row.vehicleNumber,
    type: row.type,
    kind: row.kind,
    wing: row.wing,
    floor: row.floor,
    createdAt: row.createdAt,
  };
}

export async function listSocietyParkings(
  societyId: string,
): Promise<ParkingSlotDto[]> {
  await requireSociety(societyId);
  const rows = await db
    .select({ slot: parkingSlots, flatNumber: flats.number })
    .from(parkingSlots)
    .leftJoin(flats, eq(flats.id, parkingSlots.flatId))
    .where(
      and(eq(parkingSlots.tenantId, societyId), eq(parkingSlots.isDeleted, false)),
    )
    .orderBy(
      asc(parkingSlots.kind),
      asc(parkingSlots.wing),
      asc(parkingSlots.floor),
      asc(parkingSlots.slotNumber),
    );
  return rows.map((row) => toParkingSlotDto(row.slot, row.flatNumber));
}

async function findByIdentity(
  societyId: string,
  identity: {
    kind: "puzzle" | "open";
    wing: string | null;
    slotNumber: string;
  },
) {
  const rows = await db
    .select()
    .from(parkingSlots)
    .where(eq(parkingSlots.tenantId, societyId));
  return rows.find((row) =>
    parkingIdentitiesMatch(
      {
        kind: row.kind,
        wing: row.wing,
        slotNumber: row.slotNumber,
      },
      identity,
    ),
  );
}

export async function addSocietyParking(
  societyId: string,
  actorUserId: string,
  raw: {
    kind: "puzzle" | "open";
    wing?: string | null;
    floor?: number | null;
    slotNumber: string;
  },
): Promise<{ slot: ParkingSlotDto; created: boolean; updated: boolean }> {
  await requireSociety(societyId);
  const input = normalizeSocietyParking(raw);
  const existing = await findByIdentity(societyId, input);

  if (existing?.isDeleted) {
    await db
      .update(parkingSlots)
      .set({
        isDeleted: false,
        kind: input.kind,
        wing: input.wing,
        floor: input.floor,
        slotNumber: input.slotNumber,
        updatedBy: actorUserId,
      })
      .where(eq(parkingSlots.id, existing.id));
    return {
      slot: toParkingSlotDto(
        {
          ...existing,
          isDeleted: false,
          kind: input.kind,
          wing: input.wing,
          floor: input.floor,
          slotNumber: input.slotNumber,
        },
        null,
      ),
      created: true,
      updated: false,
    };
  }

  if (existing) {
    const same =
      existing.kind === input.kind &&
      (existing.wing ?? "") === (input.wing ?? "");
    if (same) {
      return {
        slot: toParkingSlotDto(existing, null),
        created: false,
        updated: false,
      };
    }
    await db
      .update(parkingSlots)
      .set({
        kind: input.kind,
        wing: input.wing,
        floor: input.floor,
        updatedBy: actorUserId,
      })
      .where(eq(parkingSlots.id, existing.id));
    return {
      slot: toParkingSlotDto(
        {
          ...existing,
          kind: input.kind,
          wing: input.wing,
          floor: input.floor,
        },
        null,
      ),
      created: false,
      updated: true,
    };
  }

  const id = crypto.randomUUID();
  await db.insert(parkingSlots).values({
    id,
    tenantId: societyId,
    slotNumber: input.slotNumber,
    kind: input.kind,
    wing: input.wing,
    floor: input.floor,
    type: "car",
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  const [created] = await db
    .select()
    .from(parkingSlots)
    .where(eq(parkingSlots.id, id))
    .limit(1);
  return { slot: toParkingSlotDto(created!, null), created: true, updated: false };
}

async function requireLiveParking(societyId: string, parkingId: string) {
  const [existing] = await db
    .select()
    .from(parkingSlots)
    .where(
      and(
        eq(parkingSlots.id, parkingId),
        eq(parkingSlots.tenantId, societyId),
        eq(parkingSlots.isDeleted, false),
      ),
    )
    .limit(1);
  if (!existing) throw new AppError(404, "not_found", "Parking slot not found");
  return existing;
}

export async function updateSocietyParking(
  societyId: string,
  parkingId: string,
  actorUserId: string,
  raw: {
    kind: "puzzle" | "open";
    wing?: string | null;
    floor?: number | null;
    slotNumber: string;
  },
): Promise<ParkingSlotDto> {
  await requireSociety(societyId);
  const existing = await requireLiveParking(societyId, parkingId);
  const input = normalizeSocietyParking(raw);

  const identityChanged =
    !slotNumbersMatch(input.slotNumber, existing.slotNumber) ||
    existing.kind !== input.kind ||
    (existing.wing ?? "") !== (input.wing ?? "");
  if (identityChanged) {
    const taken = await findByIdentity(societyId, input);
    if (taken && taken.id !== existing.id && !taken.isDeleted) {
      throw new AppError(409, "parking_number_taken", parkingTakenMessage(input));
    }
  }

  await db
    .update(parkingSlots)
    .set({
      kind: input.kind,
      wing: input.wing,
      floor: input.floor,
      slotNumber: input.slotNumber,
      updatedBy: actorUserId,
    })
    .where(eq(parkingSlots.id, existing.id));

  const [flat] = existing.flatId
    ? await db
        .select({ number: flats.number })
        .from(flats)
        .where(eq(flats.id, existing.flatId))
        .limit(1)
    : [];
  return toParkingSlotDto(
    {
      ...existing,
      kind: input.kind,
      wing: input.wing,
      floor: input.floor,
      slotNumber: input.slotNumber,
    },
    flat?.number ?? null,
  );
}

export async function deleteSocietyParking(
  societyId: string,
  parkingId: string,
  actorUserId: string,
): Promise<{ ok: true }> {
  await requireSociety(societyId);
  const existing = await requireLiveParking(societyId, parkingId);
  if (existing.flatId) {
    throw new AppError(
      409,
      "parking_in_use",
      "This parking is assigned to a flat. Clear it on the flat first.",
    );
  }
  await softDelete(parkingSlots, parkingId, actorUserId);
  return { ok: true };
}

export async function importSocietyParkings(
  societyId: string,
  actorUserId: string,
  rows: Array<{
    kind: "puzzle" | "open";
    wing?: string | null;
    floor?: number | null;
    slotNumber: string;
  }>,
): Promise<SocietyFlatImportResultDto> {
  const result: SocietyFlatImportResultDto = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 1;
    try {
      const outcome = await addSocietyParking(societyId, actorUserId, rows[i]!);
      if (outcome.created) result.created += 1;
      else if (outcome.updated) result.updated += 1;
      else result.skipped += 1;
    } catch (err) {
      const message =
        err instanceof AppError ? err.message : "Could not add this parking";
      result.errors.push({ row: rowNum, message });
    }
  }
  return result;
}
