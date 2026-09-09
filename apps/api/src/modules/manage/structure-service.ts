import { and, asc, eq } from "drizzle-orm";
import type { FlatDto, SocietyFlatImportResultDto } from "@society-hub/types";
import { db } from "../../db/client";
import { buildings, flats, residents, societies, wings } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { softDelete } from "../../lib/soft-delete";
import { wingNamesMatch } from "./structure-helpers";

const DEFAULT_BUILDING_NAME = "Main";

async function requireSociety(societyId: string) {
  const [society] = await db
    .select({ id: societies.id })
    .from(societies)
    .where(and(eq(societies.id, societyId), eq(societies.isDeleted, false)))
    .limit(1);
  if (!society) throw new AppError(404, "not_found", "Society not found");
}

function toFlatDto(
  row: typeof flats.$inferSelect,
  wingName: string | null,
): FlatDto {
  return {
    id: row.id,
    number: row.number,
    wingId: row.wingId,
    wingName,
    floor: row.floor,
    parkingSlot: row.parkingSlot,
    pngGasConnection: Boolean(row.pngGasConnection),
    twoWheelerCount: 0,
    fourWheelerCount: 0,
    adultCount: row.adultCount ?? 0,
    childCount: row.childCount ?? 0,
    seniorCitizenCount: row.seniorCitizenCount ?? 0,
    details: null,
  };
}

async function ensureBuilding(tenantId: string, actorUserId: string) {
  const existing = await db
    .select()
    .from(buildings)
    .where(and(eq(buildings.tenantId, tenantId), eq(buildings.isDeleted, false)))
    .orderBy(asc(buildings.createdAt))
    .limit(1);
  if (existing[0]) return existing[0];

  const id = crypto.randomUUID();
  await db.insert(buildings).values({
    id,
    tenantId,
    name: DEFAULT_BUILDING_NAME,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  const [created] = await db
    .select()
    .from(buildings)
    .where(eq(buildings.id, id))
    .limit(1);
  return created!;
}

async function ensureWing(
  tenantId: string,
  buildingId: string,
  wingName: string,
  actorUserId: string,
) {
  const wingRows = await db
    .select()
    .from(wings)
    .where(and(eq(wings.tenantId, tenantId), eq(wings.isDeleted, false)));
  const match = wingRows.find((w) => wingNamesMatch(w.name, wingName));
  if (match) return match;

  const id = crypto.randomUUID();
  await db.insert(wings).values({
    id,
    tenantId,
    buildingId,
    name: wingName.trim(),
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  const [created] = await db
    .select()
    .from(wings)
    .where(eq(wings.id, id))
    .limit(1);
  return created!;
}

export async function listSocietyFlats(societyId: string): Promise<FlatDto[]> {
  await requireSociety(societyId);
  const rows = await db
    .select({
      flat: flats,
      wingName: wings.name,
    })
    .from(flats)
    .leftJoin(wings, eq(wings.id, flats.wingId))
    .where(and(eq(flats.tenantId, societyId), eq(flats.isDeleted, false)))
    .orderBy(asc(wings.name), asc(flats.floor), asc(flats.number));
  return rows.map((row) => toFlatDto(row.flat, row.wingName));
}

export async function addSocietyFlat(
  societyId: string,
  actorUserId: string,
  input: { wing: string; floor: number; flatNumber: string },
): Promise<{ flat: FlatDto; created: boolean; updated: boolean }> {
  await requireSociety(societyId);
  const wingName = input.wing.trim();
  const number = input.flatNumber.trim();
  const building = await ensureBuilding(societyId, actorUserId);
  const wing = await ensureWing(societyId, building.id, wingName, actorUserId);

  const [existing] = await db
    .select()
    .from(flats)
    .where(and(eq(flats.tenantId, societyId), eq(flats.number, number)))
    .limit(1);

  if (existing?.isDeleted) {
    await db
      .update(flats)
      .set({
        isDeleted: false,
        wingId: wing.id,
        floor: input.floor,
        updatedBy: actorUserId,
      })
      .where(eq(flats.id, existing.id));
    return {
      flat: toFlatDto(
        { ...existing, isDeleted: false, wingId: wing.id, floor: input.floor },
        wing.name,
      ),
      created: true,
      updated: false,
    };
  }

  if (existing) {
    const [existingWing] = await db
      .select()
      .from(wings)
      .where(eq(wings.id, existing.wingId))
      .limit(1);
    if (!existingWing || !wingNamesMatch(existingWing.name, wingName)) {
      throw new AppError(
        409,
        "flat_number_taken",
        `Flat ${number} already exists in this society`,
      );
    }
    if (existing.floor === input.floor) {
      return {
        flat: toFlatDto(existing, existingWing.name),
        created: false,
        updated: false,
      };
    }
    await db
      .update(flats)
      .set({ floor: input.floor, updatedBy: actorUserId })
      .where(eq(flats.id, existing.id));
    return {
      flat: toFlatDto({ ...existing, floor: input.floor }, existingWing.name),
      created: false,
      updated: true,
    };
  }

  const id = crypto.randomUUID();
  await db.insert(flats).values({
    id,
    tenantId: societyId,
    wingId: wing.id,
    number,
    floor: input.floor,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  const [created] = await db
    .select()
    .from(flats)
    .where(eq(flats.id, id))
    .limit(1);
  return { flat: toFlatDto(created!, wing.name), created: true, updated: false };
}

async function requireLiveFlat(societyId: string, flatId: string) {
  const [existing] = await db
    .select()
    .from(flats)
    .where(
      and(
        eq(flats.id, flatId),
        eq(flats.tenantId, societyId),
        eq(flats.isDeleted, false),
      ),
    )
    .limit(1);
  if (!existing) throw new AppError(404, "not_found", "Flat not found");
  return existing;
}

export async function updateSocietyFlat(
  societyId: string,
  flatId: string,
  actorUserId: string,
  input: { wing: string; floor: number; flatNumber: string },
): Promise<FlatDto> {
  await requireSociety(societyId);
  const existing = await requireLiveFlat(societyId, flatId);
  const wingName = input.wing.trim();
  const number = input.flatNumber.trim();
  const building = await ensureBuilding(societyId, actorUserId);
  const wing = await ensureWing(societyId, building.id, wingName, actorUserId);

  if (number !== existing.number) {
    const [taken] = await db
      .select({ id: flats.id })
      .from(flats)
      .where(and(eq(flats.tenantId, societyId), eq(flats.number, number)))
      .limit(1);
    if (taken && taken.id !== existing.id) {
      throw new AppError(
        409,
        "flat_number_taken",
        `Flat ${number} already exists in this society`,
      );
    }
  }

  await db
    .update(flats)
    .set({
      wingId: wing.id,
      number,
      floor: input.floor,
      updatedBy: actorUserId,
    })
    .where(eq(flats.id, existing.id));
  return toFlatDto(
    { ...existing, wingId: wing.id, number, floor: input.floor },
    wing.name,
  );
}

export async function deleteSocietyFlat(
  societyId: string,
  flatId: string,
  actorUserId: string,
): Promise<{ ok: true }> {
  await requireSociety(societyId);
  await requireLiveFlat(societyId, flatId);
  const [linked] = await db
    .select({ id: residents.id })
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, societyId),
        eq(residents.flatId, flatId),
        eq(residents.isDeleted, false),
      ),
    )
    .limit(1);
  if (linked) {
    throw new AppError(
      409,
      "flat_in_use",
      "This flat has residents. Remove them in the Client App first.",
    );
  }
  await softDelete(flats, flatId, actorUserId);
  return { ok: true };
}

export async function importSocietyFlats(
  societyId: string,
  actorUserId: string,
  rows: Array<{ wing: string; floor: number; flatNumber: string }>,
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
      const outcome = await addSocietyFlat(societyId, actorUserId, rows[i]!);
      if (outcome.created) result.created += 1;
      else if (outcome.updated) result.updated += 1;
      else result.skipped += 1;
    } catch (err) {
      const message =
        err instanceof AppError ? err.message : "Could not add this flat";
      result.errors.push({ row: rowNum, message });
    }
  }
  return result;
}
