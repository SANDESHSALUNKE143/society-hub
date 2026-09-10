import { and, eq, inArray } from "drizzle-orm";
import { residentImportSchema } from "@society-hub/validation";
import type {
  ResidentImportPreviewDto,
  ResidentImportPreviewRowDto,
  ResidentImportResultDto,
  ResidentType,
} from "@society-hub/types";
import { db } from "../../db/client";
import { flats, residents, societies, users, wings } from "../../db/schema";
import { createInvitationForTenant } from "../invitations/routes";
import {
  onboardResidentIntoTenant,
  syncFlatParkingSlot,
} from "./onboard-resident";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

type ParsedImport = ReturnType<typeof residentImportSchema.parse>;
type ParsedRow = ParsedImport["rows"][number];

function residentTypeOf(row: ParsedRow): ResidentType {
  if (row.residentType) return row.residentType;
  return row.isOwner === false ? "tenant" : "owner";
}

/**
 * Last row wins for a repeated phone within one file, and the duplicate is
 * reported rather than silently dropped.
 */
function dedupe(rows: ParsedRow[]) {
  const byKey = new Map<string, { row: ParsedRow; rowNum: number }>();
  const duplicates: Array<{ rowNum: number; key: string }> = [];
  rows.forEach((row, i) => {
    const rowNum = i + 1;
    const key = normalizePhone(row.phone) || `email:${row.email?.toLowerCase() ?? i}`;
    if (byKey.has(key)) duplicates.push({ rowNum: byKey.get(key)!.rowNum, key });
    byKey.set(key, { row, rowNum });
  });
  return { entries: [...byKey.values()], duplicates };
}

type StructureIndex = {
  flatRows: Array<typeof flats.$inferSelect>;
  wingRows: Array<typeof wings.$inferSelect>;
};

async function loadStructure(tenantId: string): Promise<StructureIndex> {
  const [wingRows, flatRows] = await Promise.all([
    db
      .select()
      .from(wings)
      .where(and(eq(wings.tenantId, tenantId), eq(wings.isDeleted, false))),
    db
      .select()
      .from(flats)
      .where(and(eq(flats.tenantId, tenantId), eq(flats.isDeleted, false))),
  ]);
  return { wingRows, flatRows };
}

/** Resolve a CSV row's flat, preferring an exact wing + number match. */
function findFlat(index: StructureIndex, row: ParsedRow) {
  if (row.wingName) {
    const wing = index.wingRows.find(
      (w) => w.name.toLowerCase() === row.wingName!.toLowerCase(),
    );
    if (!wing) return { flat: undefined, wingMissing: true as const };
    const flat = index.flatRows.find(
      (f) =>
        f.wingId === wing.id &&
        f.number.toLowerCase() === row.flatNumber.toLowerCase(),
    );
    return { flat, wingMissing: false as const, wing };
  }
  const flat = index.flatRows.find(
    (f) => f.number.toLowerCase() === row.flatNumber.toLowerCase(),
  );
  return { flat, wingMissing: false as const };
}

/**
 * Dry run of an import. Resolves every row against the live structure and the
 * existing residents so the admin sees exactly what Confirm will do — no writes.
 */
export async function previewResidentImport(
  tenantId: string,
  body: unknown,
): Promise<ResidentImportPreviewDto> {
  const parsed = residentImportSchema.parse(body);
  const index = await loadStructure(tenantId);
  const { entries, duplicates } = dedupe(parsed.rows);
  const duplicateRowNums = new Set(duplicates.map((d) => d.rowNum));

  const phones = entries.map((e) => normalizePhone(e.row.phone)).filter(Boolean);
  const emails = entries
    .map((e) => e.row.email?.toLowerCase().trim())
    .filter((e): e is string => Boolean(e));

  const [existingUsers, existingMemberships] = await Promise.all([
    phones.length || emails.length
      ? db
          .select({ id: users.id, phone: users.phone, email: users.email })
          .from(users)
          .where(
            and(
              eq(users.isDeleted, false),
              phones.length
                ? inArray(users.phone, phones)
                : inArray(users.email, emails),
            ),
          )
      : Promise.resolve([]),
    db
      .select({ userId: residents.userId, flatId: residents.flatId })
      .from(residents)
      .where(
        and(eq(residents.tenantId, tenantId), eq(residents.isDeleted, false)),
      ),
  ]);

  const userByPhone = new Map(
    existingUsers.filter((u) => u.phone).map((u) => [u.phone!, u.id]),
  );
  const userByEmail = new Map(
    existingUsers.filter((u) => u.email).map((u) => [u.email!, u.id]),
  );
  const membershipFlats = new Map<string, Set<string>>();
  for (const m of existingMemberships) {
    const set = membershipFlats.get(m.userId) ?? new Set<string>();
    set.add(m.flatId);
    membershipFlats.set(m.userId, set);
  }

  const rows: ResidentImportPreviewRowDto[] = entries.map(({ row, rowNum }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (duplicateRowNums.has(rowNum)) {
      warnings.push("Duplicate phone earlier in the file — the last row wins");
    }

    const resolved = findFlat(index, row);
    if (resolved.wingMissing) {
      errors.push(`Wing "${row.wingName}" does not exist — create it under Structure first`);
    } else if (!resolved.flat && !parsed.createMissingFlats) {
      errors.push(
        row.wingName
          ? `Flat "${row.flatNumber}" does not exist in wing "${row.wingName}"`
          : `Flat "${row.flatNumber}" does not exist`,
      );
    } else if (!resolved.flat) {
      warnings.push(`Flat "${row.flatNumber}" will be created`);
    }

    const phone = normalizePhone(row.phone);
    const email = row.email?.toLowerCase().trim() ?? null;
    const userId = userByPhone.get(phone) ?? (email ? userByEmail.get(email) : undefined);
    const occupiesSameFlat =
      userId && resolved.flat
        ? (membershipFlats.get(userId)?.has(resolved.flat.id) ?? false)
        : false;

    const action: ResidentImportPreviewRowDto["action"] = errors.length
      ? "skip"
      : !userId
        ? "create"
        : occupiesSameFlat
          ? "unchanged"
          : "update";

    return {
      row: rowNum,
      name: row.name,
      phone,
      email,
      flatNumber: row.flatNumber,
      wingName: row.wingName ?? null,
      residentType: residentTypeOf(row),
      action,
      flatExists: Boolean(resolved.flat),
      errors,
      warnings,
    };
  });

  return {
    total: parsed.rows.length,
    valid: rows.filter((r) => r.errors.length === 0).length,
    invalid: rows.filter((r) => r.errors.length > 0).length,
    willCreate: rows.filter((r) => r.action === "create").length,
    willUpdate: rows.filter((r) => r.action === "update").length,
    willSkip: rows.filter((r) => r.action === "skip").length,
    unchanged: rows.filter((r) => r.action === "unchanged").length,
    rows,
  };
}

/**
 * Incremental CSV upsert:
 * - Match residents by phone (preferred) or email
 * - Re-uploading the same CSV updates name/email/flat/owner/profile
 * - Optionally refresh flat floor/parking and create missing flats
 * - Invites only for newly created residents unless forceInvite
 *
 * Rows are validated up-front and, unless `allowPartial` is set, a file with any
 * invalid row is rejected whole so a bad upload cannot half-apply.
 */
export async function importResidentsCsvRows(
  tenantId: string,
  actorUserId: string,
  body: unknown,
): Promise<ResidentImportResultDto> {
  const parsed = residentImportSchema.parse(body);
  const [society] = await db
    .select()
    .from(societies)
    .where(and(eq(societies.id, tenantId), eq(societies.isDeleted, false)))
    .limit(1);

  const result: ResidentImportResultDto = {
    total: parsed.rows.length,
    created: 0,
    updated: 0,
    invited: 0,
    skipped: 0,
    unchanged: 0,
    errors: [],
  };

  // Pre-flight: refuse the whole file when any row cannot be applied, so the
  // admin fixes the CSV instead of hunting for half-imported rows.
  const preview = await previewResidentImport(tenantId, parsed);
  const blocking = preview.rows.filter((r) => r.errors.length > 0);
  if (blocking.length > 0 && !parsed.allowPartial) {
    result.skipped = preview.total;
    result.errors = blocking.map((r) => ({
      row: r.row,
      flatNumber: r.flatNumber,
      message: r.errors.join("; "),
    }));
    return result;
  }

  let index = await loadStructure(tenantId);
  const { entries } = dedupe(parsed.rows);

  for (const { row, rowNum } of entries) {
    try {
      const resolved = findFlat(index, row);
      let flat = resolved.flat;

      if (!flat && parsed.createMissingFlats && row.wingName && !resolved.wingMissing) {
        const wing = resolved.wing!;
        const id = crypto.randomUUID();
        await db.insert(flats).values({
          id,
          tenantId,
          wingId: wing.id,
          number: row.flatNumber,
          floor: row.floor ?? null,
          parkingSlot: row.parkingSlot ?? null,
          pngGasConnection: row.pngGasConnection ?? false,
          adultCount: row.adultCount ?? 0,
          childCount: row.childCount ?? 0,
          seniorCitizenCount: row.seniorCitizenCount ?? 0,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        });
        await syncFlatParkingSlot({
          tenantId,
          flatId: id,
          parkingSlot: row.parkingSlot,
          actorUserId,
        });
        index = await loadStructure(tenantId);
        flat = index.flatRows.find((f) => f.id === id)!;
      }

      if (!flat) {
        result.errors.push({
          row: rowNum,
          flatNumber: row.flatNumber,
          message: row.wingName
            ? `Flat "${row.flatNumber}" not found in wing "${row.wingName}"`
            : `Flat "${row.flatNumber}" not found — create it under Structure first`,
        });
        result.skipped += 1;
        continue;
      }

      if (parsed.updateFlats) {
        const nextFloor = row.floor !== undefined ? row.floor : flat.floor;
        const nextParking =
          row.parkingSlot !== undefined && row.parkingSlot !== null
            ? row.parkingSlot
            : flat.parkingSlot;
        const floorChanged = nextFloor !== flat.floor;
        const parkingChanged = (nextParking ?? null) !== (flat.parkingSlot ?? null);
        const nextPng =
          row.pngGasConnection !== undefined
            ? row.pngGasConnection
            : Boolean(flat.pngGasConnection);
        const pngChanged = nextPng !== Boolean(flat.pngGasConnection);
        const nextAdults =
          row.adultCount !== undefined ? row.adultCount : flat.adultCount;
        const nextChildren =
          row.childCount !== undefined ? row.childCount : flat.childCount;
        const nextSeniors =
          row.seniorCitizenCount !== undefined
            ? row.seniorCitizenCount
            : flat.seniorCitizenCount;
        const familyChanged =
          nextAdults !== flat.adultCount ||
          nextChildren !== flat.childCount ||
          nextSeniors !== flat.seniorCitizenCount;
        if (floorChanged || parkingChanged || pngChanged || familyChanged) {
          await db
            .update(flats)
            .set({
              floor: nextFloor ?? null,
              parkingSlot: nextParking ?? null,
              pngGasConnection: nextPng,
              adultCount: nextAdults,
              childCount: nextChildren,
              seniorCitizenCount: nextSeniors,
              updatedBy: actorUserId,
            })
            .where(eq(flats.id, flat.id));
          if (parkingChanged) {
            await syncFlatParkingSlot({
              tenantId,
              flatId: flat.id,
              parkingSlot: nextParking,
              actorUserId,
            });
          }
          index.flatRows = index.flatRows.map((f) =>
            f.id === flat!.id
              ? {
                  ...f,
                  floor: nextFloor ?? null,
                  parkingSlot: nextParking ?? null,
                  pngGasConnection: nextPng,
                  adultCount: nextAdults,
                  childCount: nextChildren,
                  seniorCitizenCount: nextSeniors,
                }
              : f,
          );
        }
      }

      const outcome = await onboardResidentIntoTenant({
        tenantId,
        actorUserId,
        name: row.name,
        phone: row.phone,
        email: row.email ?? null,
        flatId: flat.id,
        residentType: residentTypeOf(row),
        isOwner: row.isOwner,
        emergencyContact: row.emergencyContact,
        vehicleNumber: row.vehicleNumber,
        vehicles: row.vehicles,
        pngGasConnection: row.pngGasConnection,
        adultCount: row.adultCount,
        childCount: row.childCount,
        seniorCitizenCount: row.seniorCitizenCount,
      });

      if (outcome.created) result.created += 1;
      else if (outcome.updated) result.updated += 1;
      else result.unchanged += 1;

      const shouldInvite =
        (parsed.sendInvites || row.sendInvite) &&
        (outcome.created || parsed.forceInvite) &&
        (row.email || row.phone);

      if (shouldInvite) {
        try {
          await createInvitationForTenant(tenantId, actorUserId, {
            name: row.name,
            email: row.email ?? null,
            phone: row.phone,
            flatId: flat.id,
            residentType: residentTypeOf(row),
            role: "resident",
            channels: [
              ...(row.email ? (["email"] as const) : []),
              ...(row.phone ? (["whatsapp"] as const) : []),
            ],
            societyName: society?.name ?? "your society",
          });
          result.invited += 1;
        } catch (err) {
          // A pre-existing live invite is not an import failure.
          result.errors.push({
            row: rowNum,
            flatNumber: row.flatNumber,
            message: err instanceof Error ? err.message : "Invite not sent",
          });
        }
      }
    } catch (err) {
      result.errors.push({
        row: rowNum,
        flatNumber: row.flatNumber,
        message: err instanceof Error ? err.message : "Import failed",
      });
      result.skipped += 1;
    }
  }

  return result;
}
