import { and, eq } from "drizzle-orm";
import { residentImportSchema } from "@society-hub/validation";
import type { ResidentImportResultDto } from "@society-hub/types";
import { db } from "../../db/client";
import { flats, societies, wings } from "../../db/schema";
import { createInvitationForTenant } from "../invitations/routes";
import {
  onboardResidentIntoTenant,
  syncFlatParkingSlot,
} from "./onboard-resident";

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

/**
 * Incremental CSV upsert:
 * - Match residents by phone (preferred) or email
 * - Re-uploading the same CSV updates name/email/flat/owner/profile
 * - Optionally refresh flat floor/parking and create missing flats
 * - Invites only for newly created residents unless forceInvite
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

  let wingRows = await db
    .select()
    .from(wings)
    .where(and(eq(wings.tenantId, tenantId), eq(wings.isDeleted, false)));
  let flatRows = await db
    .select()
    .from(flats)
    .where(and(eq(flats.tenantId, tenantId), eq(flats.isDeleted, false)));

  const result: ResidentImportResultDto = {
    created: 0,
    updated: 0,
    invited: 0,
    skipped: 0,
    unchanged: 0,
    errors: [],
  };

  // Last row wins for duplicate phones within the same file.
  const deduped = new Map<string, { row: (typeof parsed.rows)[number]; rowNum: number }>();
  parsed.rows.forEach((row, i) => {
    const key = normalizePhone(row.phone) || `email:${row.email?.toLowerCase() ?? i}`;
    deduped.set(key, { row, rowNum: i + 1 });
  });

  for (const { row, rowNum } of deduped.values()) {
    try {
      let flat =
        (row.wingName
          ? flatRows.find((f) => {
              const wing = wingRows.find((w) => w.id === f.wingId);
              return (
                wing?.name.toLowerCase() === row.wingName!.toLowerCase() &&
                f.number.toLowerCase() === row.flatNumber.toLowerCase()
              );
            })
          : undefined) ??
        flatRows.find(
          (f) => f.number.toLowerCase() === row.flatNumber.toLowerCase(),
        );

      if (!flat && row.wingName && parsed.createMissingFlats) {
        const wing = wingRows.find(
          (w) => w.name.toLowerCase() === row.wingName!.toLowerCase(),
        );
        if (!wing) {
          result.errors.push({
            row: rowNum,
            message: `Wing "${row.wingName}" not found — create structure first`,
          });
          result.skipped += 1;
          continue;
        }
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
        flatRows = await db
          .select()
          .from(flats)
          .where(and(eq(flats.tenantId, tenantId), eq(flats.isDeleted, false)));
        flat = flatRows.find((f) => f.id === id)!;
      }

      if (!flat && row.wingName) {
        const wing = wingRows.find(
          (w) => w.name.toLowerCase() === row.wingName!.toLowerCase(),
        );
        if (!wing) {
          result.errors.push({
            row: rowNum,
            message: `Wing "${row.wingName}" not found — create structure first`,
          });
          result.skipped += 1;
          continue;
        }
        result.errors.push({
          row: rowNum,
          message: `Flat "${row.flatNumber}" not found in wing "${row.wingName}"`,
        });
        result.skipped += 1;
        continue;
      }

      if (!flat) {
        result.errors.push({
          row: rowNum,
          message: `Flat "${row.flatNumber}" not found — create it under Structure first`,
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
          flatRows = flatRows.map((f) =>
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
        isOwner: row.isOwner ?? true,
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
        await createInvitationForTenant(tenantId, actorUserId, {
          email: row.email ?? null,
          phone: row.phone,
          role: "resident",
          channels: [
            ...(row.email ? (["email"] as const) : []),
            ...(row.phone ? (["whatsapp"] as const) : []),
          ],
          societyName: society?.name ?? "your society",
        });
        result.invited += 1;
      }
    } catch (err) {
      result.errors.push({
        row: rowNum,
        message: err instanceof Error ? err.message : "Import failed",
      });
      result.skipped += 1;
    }
  }

  return result;
}
