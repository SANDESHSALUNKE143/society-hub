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
  building?: { id: string; name: string } | null,
): FlatDto {
  return {
    id: row.id,
    number: row.number,
    wingId: row.wingId,
    wingName,
    buildingId: building?.id ?? null,
    buildingName: building?.name ?? null,
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

async function resolveBuilding(
  tenantId: string,
  actorUserId: string,
  opts: { buildingId?: string | null; buildingName?: string | null },
) {
  if (opts.buildingId) {
    const [row] = await db
      .select()
      .from(buildings)
      .where(
        and(
          eq(buildings.id, opts.buildingId),
          eq(buildings.tenantId, tenantId),
          eq(buildings.isDeleted, false),
        ),
      )
      .limit(1);
    if (!row) throw new AppError(404, "not_found", "Tower / building not found");
    return row;
  }

  const wanted = opts.buildingName?.trim();
  if (wanted) {
    const rows = await db
      .select()
      .from(buildings)
      .where(and(eq(buildings.tenantId, tenantId), eq(buildings.isDeleted, false)));
    const match = rows.find(
      (b) => b.name.trim().toLowerCase() === wanted.toLowerCase(),
    );
    if (match) return match;

    const id = crypto.randomUUID();
    await db.insert(buildings).values({
      id,
      tenantId,
      name: wanted,
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

  return ensureBuilding(tenantId, actorUserId);
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
    .where(
      and(
        eq(wings.tenantId, tenantId),
        eq(wings.buildingId, buildingId),
        eq(wings.isDeleted, false),
      ),
    );
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
      buildingId: buildings.id,
      buildingName: buildings.name,
    })
    .from(flats)
    .leftJoin(wings, eq(wings.id, flats.wingId))
    .leftJoin(buildings, eq(buildings.id, wings.buildingId))
    .where(and(eq(flats.tenantId, societyId), eq(flats.isDeleted, false)))
    .orderBy(
      asc(buildings.name),
      asc(wings.name),
      asc(flats.floor),
      asc(flats.number),
    );
  return rows.map((row) =>
    toFlatDto(
      row.flat,
      row.wingName,
      row.buildingId && row.buildingName
        ? { id: row.buildingId, name: row.buildingName }
        : null,
    ),
  );
}

export async function listSocietyBuildings(societyId: string) {
  await requireSociety(societyId);
  const rows = await db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(and(eq(buildings.tenantId, societyId), eq(buildings.isDeleted, false)))
    .orderBy(asc(buildings.name));
  return rows;
}

export async function addSocietyBuilding(
  societyId: string,
  actorUserId: string,
  name: string,
) {
  await requireSociety(societyId);
  const wanted = name.trim();
  const existing = await db
    .select()
    .from(buildings)
    .where(and(eq(buildings.tenantId, societyId), eq(buildings.isDeleted, false)));
  const match = existing.find(
    (b) => b.name.trim().toLowerCase() === wanted.toLowerCase(),
  );
  if (match) return { id: match.id, name: match.name };

  const id = crypto.randomUUID();
  await db.insert(buildings).values({
    id,
    tenantId: societyId,
    name: wanted,
    createdBy: actorUserId,
    updatedBy: actorUserId,
  });
  return { id, name: wanted };
}

export async function addSocietyFlat(
  societyId: string,
  actorUserId: string,
  input: {
    wing: string;
    floor: number;
    flatNumber: string;
    buildingId?: string | null;
    buildingName?: string | null;
  },
): Promise<{ flat: FlatDto; created: boolean; updated: boolean }> {
  await requireSociety(societyId);
  const wingName = input.wing.trim();
  const number = input.flatNumber.trim();
  const building = await resolveBuilding(societyId, actorUserId, {
    buildingId: input.buildingId,
    buildingName: input.buildingName,
  });
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
        { id: building.id, name: building.name },
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
        flat: toFlatDto(existing, existingWing.name, {
          id: building.id,
          name: building.name,
        }),
        created: false,
        updated: false,
      };
    }
    await db
      .update(flats)
      .set({ floor: input.floor, updatedBy: actorUserId })
      .where(eq(flats.id, existing.id));
    return {
      flat: toFlatDto(
        { ...existing, floor: input.floor },
        existingWing.name,
        { id: building.id, name: building.name },
      ),
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
  return {
    flat: toFlatDto(created!, wing.name, { id: building.id, name: building.name }),
    created: true,
    updated: false,
  };
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
  input: {
    wing: string;
    floor: number;
    flatNumber: string;
    buildingId?: string | null;
    buildingName?: string | null;
  },
): Promise<FlatDto> {
  await requireSociety(societyId);
  const existing = await requireLiveFlat(societyId, flatId);
  const wingName = input.wing.trim();
  const number = input.flatNumber.trim();
  const [currentWing] = await db
    .select()
    .from(wings)
    .where(eq(wings.id, existing.wingId))
    .limit(1);
  const building = await resolveBuilding(societyId, actorUserId, {
    buildingId: input.buildingId ?? currentWing?.buildingId ?? null,
    buildingName: input.buildingName,
  });
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
    { id: building.id, name: building.name },
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
  opts: { buildingId?: string | null; buildingName?: string | null } = {},
): Promise<SocietyFlatImportResultDto> {
  const result: SocietyFlatImportResultDto = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
  // Resolve tower once so the whole CSV lands under the same building.
  const building = await resolveBuilding(societyId, actorUserId, opts);
  for (let i = 0; i < rows.length; i += 1) {
    const rowNum = i + 1;
    try {
      const outcome = await addSocietyFlat(societyId, actorUserId, {
        ...rows[i]!,
        buildingId: building.id,
      });
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

export type ManageBuildingDto = {
  id: string;
  name: string;
  wingCount: number;
  flatCount: number;
};

export type ManageWingDto = {
  id: string;
  name: string;
  buildingId: string;
  flatCount: number;
};

export async function listSocietyBuildingsDetailed(
  societyId: string,
): Promise<ManageBuildingDto[]> {
  await requireSociety(societyId);
  const buildingRows = await db
    .select({ id: buildings.id, name: buildings.name })
    .from(buildings)
    .where(and(eq(buildings.tenantId, societyId), eq(buildings.isDeleted, false)))
    .orderBy(asc(buildings.name));

  const result: ManageBuildingDto[] = [];
  for (const b of buildingRows) {
    const wingRows = await db
      .select({ id: wings.id })
      .from(wings)
      .where(
        and(
          eq(wings.tenantId, societyId),
          eq(wings.buildingId, b.id),
          eq(wings.isDeleted, false),
        ),
      );
    const wingSet = new Set(wingRows.map((w) => w.id));
    let flatCount = 0;
    if (wingSet.size > 0) {
      const liveFlats = await db
        .select({ wingId: flats.wingId })
        .from(flats)
        .where(and(eq(flats.tenantId, societyId), eq(flats.isDeleted, false)));
      flatCount = liveFlats.filter((f) => wingSet.has(f.wingId)).length;
    }
    result.push({
      id: b.id,
      name: b.name,
      wingCount: wingRows.length,
      flatCount,
    });
  }
  return result;
}

export async function renameSocietyBuilding(
  societyId: string,
  buildingId: string,
  actorUserId: string,
  name: string,
): Promise<{ id: string; name: string }> {
  await requireSociety(societyId);
  const wanted = name.trim();
  const [row] = await db
    .select()
    .from(buildings)
    .where(
      and(
        eq(buildings.id, buildingId),
        eq(buildings.tenantId, societyId),
        eq(buildings.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Tower not found");

  const others = await db
    .select()
    .from(buildings)
    .where(and(eq(buildings.tenantId, societyId), eq(buildings.isDeleted, false)));
  const clash = others.find(
    (b) =>
      b.id !== buildingId &&
      b.name.trim().toLowerCase() === wanted.toLowerCase(),
  );
  if (clash) {
    throw new AppError(409, "building_name_taken", `Tower "${wanted}" already exists`);
  }

  await db
    .update(buildings)
    .set({ name: wanted, updatedBy: actorUserId })
    .where(eq(buildings.id, buildingId));
  return { id: buildingId, name: wanted };
}

export async function deleteSocietyBuilding(
  societyId: string,
  buildingId: string,
  actorUserId: string,
): Promise<{ ok: true }> {
  await requireSociety(societyId);
  const [row] = await db
    .select()
    .from(buildings)
    .where(
      and(
        eq(buildings.id, buildingId),
        eq(buildings.tenantId, societyId),
        eq(buildings.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Tower not found");

  const wingRows = await db
    .select({ id: wings.id })
    .from(wings)
    .where(
      and(
        eq(wings.tenantId, societyId),
        eq(wings.buildingId, buildingId),
        eq(wings.isDeleted, false),
      ),
    );
  const wingIds = wingRows.map((w) => w.id);
  if (wingIds.length > 0) {
    const flatRows = await db
      .select({ id: flats.id, wingId: flats.wingId })
      .from(flats)
      .where(and(eq(flats.tenantId, societyId), eq(flats.isDeleted, false)));
    const wingSet = new Set(wingIds);
    const underTower = flatRows.filter((f) => wingSet.has(f.wingId));
    if (underTower.length > 0) {
      for (const flat of underTower) {
        const [linked] = await db
          .select({ id: residents.id })
          .from(residents)
          .where(
            and(
              eq(residents.tenantId, societyId),
              eq(residents.flatId, flat.id),
              eq(residents.isDeleted, false),
            ),
          )
          .limit(1);
        if (linked) {
          throw new AppError(
            409,
            "building_in_use",
            "This tower still has occupied flats. Move residents out first.",
          );
        }
      }
      for (const flat of underTower) {
        await softDelete(flats, flat.id, actorUserId);
      }
    }
    for (const w of wingRows) {
      await softDelete(wings, w.id, actorUserId);
    }
  }
  await softDelete(buildings, buildingId, actorUserId);
  return { ok: true };
}

export async function listSocietyWings(
  societyId: string,
  buildingId: string,
): Promise<ManageWingDto[]> {
  await requireSociety(societyId);
  const [building] = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(
      and(
        eq(buildings.id, buildingId),
        eq(buildings.tenantId, societyId),
        eq(buildings.isDeleted, false),
      ),
    )
    .limit(1);
  if (!building) throw new AppError(404, "not_found", "Tower not found");

  const wingRows = await db
    .select({ id: wings.id, name: wings.name, buildingId: wings.buildingId })
    .from(wings)
    .where(
      and(
        eq(wings.tenantId, societyId),
        eq(wings.buildingId, buildingId),
        eq(wings.isDeleted, false),
      ),
    )
    .orderBy(asc(wings.name));

  const result: ManageWingDto[] = [];
  for (const w of wingRows) {
    const flatRows = await db
      .select({ id: flats.id })
      .from(flats)
      .where(
        and(
          eq(flats.tenantId, societyId),
          eq(flats.wingId, w.id),
          eq(flats.isDeleted, false),
        ),
      );
    result.push({
      id: w.id,
      name: w.name,
      buildingId: w.buildingId,
      flatCount: flatRows.length,
    });
  }
  return result;
}

export async function addSocietyWing(
  societyId: string,
  buildingId: string,
  actorUserId: string,
  name: string,
): Promise<ManageWingDto> {
  await requireSociety(societyId);
  const [building] = await db
    .select({ id: buildings.id })
    .from(buildings)
    .where(
      and(
        eq(buildings.id, buildingId),
        eq(buildings.tenantId, societyId),
        eq(buildings.isDeleted, false),
      ),
    )
    .limit(1);
  if (!building) throw new AppError(404, "not_found", "Tower not found");

  const wing = await ensureWing(societyId, buildingId, name, actorUserId);
  return { id: wing.id, name: wing.name, buildingId, flatCount: 0 };
}

export async function renameSocietyWing(
  societyId: string,
  wingId: string,
  actorUserId: string,
  name: string,
): Promise<ManageWingDto> {
  await requireSociety(societyId);
  const wanted = name.trim();
  const [row] = await db
    .select()
    .from(wings)
    .where(
      and(
        eq(wings.id, wingId),
        eq(wings.tenantId, societyId),
        eq(wings.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Wing not found");

  const siblings = await db
    .select()
    .from(wings)
    .where(
      and(
        eq(wings.tenantId, societyId),
        eq(wings.buildingId, row.buildingId),
        eq(wings.isDeleted, false),
      ),
    );
  const clash = siblings.find(
    (w) => w.id !== wingId && wingNamesMatch(w.name, wanted),
  );
  if (clash) {
    throw new AppError(409, "wing_name_taken", `Wing "${wanted}" already exists in this tower`);
  }

  await db
    .update(wings)
    .set({ name: wanted, updatedBy: actorUserId })
    .where(eq(wings.id, wingId));

  const flatRows = await db
    .select({ id: flats.id })
    .from(flats)
    .where(
      and(
        eq(flats.tenantId, societyId),
        eq(flats.wingId, wingId),
        eq(flats.isDeleted, false),
      ),
    );
  return {
    id: wingId,
    name: wanted,
    buildingId: row.buildingId,
    flatCount: flatRows.length,
  };
}

export async function deleteSocietyWing(
  societyId: string,
  wingId: string,
  actorUserId: string,
): Promise<{ ok: true }> {
  await requireSociety(societyId);
  const [row] = await db
    .select()
    .from(wings)
    .where(
      and(
        eq(wings.id, wingId),
        eq(wings.tenantId, societyId),
        eq(wings.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Wing not found");

  const flatRows = await db
    .select({ id: flats.id })
    .from(flats)
    .where(
      and(
        eq(flats.tenantId, societyId),
        eq(flats.wingId, wingId),
        eq(flats.isDeleted, false),
      ),
    );
  for (const flat of flatRows) {
    const [linked] = await db
      .select({ id: residents.id })
      .from(residents)
      .where(
        and(
          eq(residents.tenantId, societyId),
          eq(residents.flatId, flat.id),
          eq(residents.isDeleted, false),
        ),
      )
      .limit(1);
    if (linked) {
      throw new AppError(
        409,
        "wing_in_use",
        "This wing still has occupied flats. Move residents out first.",
      );
    }
  }
  for (const flat of flatRows) {
    await softDelete(flats, flat.id, actorUserId);
  }
  await softDelete(wings, wingId, actorUserId);
  return { ok: true };
}
