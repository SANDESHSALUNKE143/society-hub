import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import type {
  ActivityEventDto,
  FlatDetailDto,
  ResidentDetailDto,
} from "@society-hub/types";
import {
  createFamilyMemberSchema,
  flatListQuerySchema,
  moveOutResidentSchema,
  onboardResidentSchema,
  rejectDocumentSchema,
  rejectResidentSchema,
  residentListQuerySchema,
  suspendResidentSchema,
  updateFamilyMemberSchema,
  updateResidentSchema,
  uploadDocumentMetaSchema,
} from "@society-hub/validation";
import { env } from "../../config";
import { db } from "../../db/client";
import { residentFamilyMembers, societies } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { ActivityType, AuditEntity, listEntityActivity, recordAudit } from "../../lib/audit";
import { softDelete } from "../../lib/soft-delete";
import { deriveOccupancy } from "../../lib/resident-lifecycle";
import {
  authPlugin,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";
import { onboardResidentIntoTenant } from "../admin/onboard-resident";
import {
  countDocumentsForFlat,
  getFlatWithStructure,
  getResidentRow,
  getResidentSummary,
  listDocuments,
  listFamilyMembers,
  listFlatHistory,
  listFlatOccupants,
  listFlatsWithOccupancy,
  listMembershipsForUser,
  listResidents,
  listRolesForUser,
  listVehiclesForFlat,
  getProfileRow,
  occupancyStats,
  parseCommunicationPreferences,
} from "./repository";
import {
  getDocumentRow,
  readDocumentFile,
  reviewDocument,
  storeDocument,
} from "./documents";
import {
  closeMembership,
  setSuspension,
  setVerification,
  updateResident,
} from "./service";

function parseDetails(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function buildResidentDetail(
  tenantId: string,
  residentId: string,
): Promise<ResidentDetailDto> {
  const summary = await getResidentSummary(tenantId, residentId);
  const row = await getResidentRow(tenantId, residentId);

  const [society, profile, family, documents, vehicles, roles, allMemberships] =
    await Promise.all([
      db
        .select({ name: societies.name })
        .from(societies)
        .where(eq(societies.id, tenantId))
        .limit(1),
      getProfileRow(tenantId, row.userId),
      listFamilyMembers(tenantId, residentId),
      listDocuments(tenantId, residentId),
      listVehiclesForFlat(tenantId, row.flatId),
      listRolesForUser(tenantId, row.userId),
      listMembershipsForUser(tenantId, row.userId),
    ]);

  const verifier = row.verifiedBy
    ? await getResidentVerifierName(row.verifiedBy)
    : null;

  return {
    ...summary,
    societyName: society[0]?.name ?? null,
    remarks: row.remarks,
    moveOutReason: row.moveOutReason,
    rejectionReason: row.rejectionReason,
    verifiedAt: row.verifiedAt,
    verifiedByName: verifier,
    roles,
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactRelation: profile?.emergencyContactRelation ?? null,
    emergencyContactPhone:
      profile?.emergencyContactPhone ?? profile?.emergencyContact ?? null,
    vehicleNumber: profile?.vehicleNumber ?? null,
    communicationPreferences: parseCommunicationPreferences(
      profile?.communicationPrefsJson,
    ),
    family,
    documents,
    vehicles,
    otherMemberships: allMemberships.filter((m) => m.id !== residentId),
  };
}

async function getResidentVerifierName(userId: string) {
  const { users } = await import("../../db/schema");
  const [row] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name ?? null;
}

async function buildFlatDetail(
  tenantId: string,
  flatId: string,
): Promise<FlatDetailDto> {
  const flat = await getFlatWithStructure(tenantId, flatId);
  const [occupants, vehicles, documentCount] = await Promise.all([
    listFlatOccupants(tenantId, flatId),
    listVehiclesForFlat(tenantId, flatId),
    countDocumentsForFlat(tenantId, flatId),
  ]);

  const owners = occupants.filter((o) => o.residentType === "owner");
  return {
    id: flat.id,
    number: flat.number,
    wingId: flat.wingId,
    wingName: flat.wingName,
    buildingId: flat.buildingId,
    buildingName: flat.buildingName,
    floor: flat.floor,
    parkingSlot: flat.parkingSlot,
    details: parseDetails(flat.detailsJson),
    occupancyStatus: deriveOccupancy(occupants),
    primaryOwner: owners.find((o) => o.isPrimary) ?? owners[0] ?? null,
    coOwners: owners.filter((o) => !o.isPrimary),
    tenants: occupants.filter((o) => o.residentType === "tenant"),
    currentOccupants: occupants,
    vehicles,
    documentCount,
  };
}

function toActivityDto(rows: Awaited<ReturnType<typeof listEntityActivity>>) {
  return rows as ActivityEventDto[];
}

export const adminResidentRoutes = new Elysia({ prefix: "/v1/admin/residents" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = residentListQuerySchema.parse(query ?? {});
    return listResidents(claims.tenantId, parsed);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = onboardResidentSchema.parse(body);
    const result = await onboardResidentIntoTenant({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      flatId: parsed.flatId,
      floor: parsed.floor,
      parkingSlot: parsed.parkingSlot,
      parkingSlotId: parsed.parkingSlotId,
      isOwner: parsed.isOwner,
      editOwner: parsed.editOwner,
      editUserId: parsed.editUserId,
      residentType: parsed.residentType,
      isPrimary: parsed.isPrimary,
      moveInDate: parsed.moveInDate,
      remarks: parsed.remarks,
      emergencyContact: parsed.emergencyContact,
      vehicleNumber: parsed.vehicleNumber,
      vehicles: parsed.vehicles,
      pngGasConnection: parsed.pngGasConnection,
      adultCount: parsed.adultCount,
      childCount: parsed.childCount,
      seniorCitizenCount: parsed.seniorCitizenCount,
    });
    return {
      ...result,
      resident: await buildResidentDetail(claims.tenantId, result.residentId),
    };
  })
  .get("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return buildResidentDetail(claims.tenantId, params.id);
  })
  .patch("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateResidentSchema.parse(body);
    await updateResident({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: params.id,
      patch: parsed,
    });
    return buildResidentDetail(claims.tenantId, params.id);
  })
  .post("/:id/verify", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await setVerification({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: params.id,
      approved: true,
    });
    return buildResidentDetail(claims.tenantId, params.id);
  })
  .post("/:id/reject", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = rejectResidentSchema.parse(body);
    await setVerification({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: params.id,
      approved: false,
      reason: parsed.reason,
    });
    return buildResidentDetail(claims.tenantId, params.id);
  })
  .post("/:id/suspend", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = suspendResidentSchema.parse(body ?? {});
    await setSuspension({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: params.id,
      suspend: true,
      reason: parsed.reason,
    });
    return buildResidentDetail(claims.tenantId, params.id);
  })
  .post("/:id/reactivate", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await setSuspension({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: params.id,
      suspend: false,
    });
    return buildResidentDetail(claims.tenantId, params.id);
  })
  .post("/:id/move-out", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = moveOutResidentSchema.parse(body ?? {});
    await closeMembership({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: params.id,
      moveOutDate: parsed.moveOutDate,
      reason: parsed.reason,
      remarks: parsed.remarks,
    });
    return buildResidentDetail(claims.tenantId, params.id);
  })
  .get("/:id/activity", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getResidentRow(claims.tenantId, params.id);
    return toActivityDto(
      await listEntityActivity(claims.tenantId, AuditEntity.RESIDENT, params.id),
    );
  })

  // ---- Family -------------------------------------------------------------
  .get("/:id/family", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getResidentRow(claims.tenantId, params.id);
    return listFamilyMembers(claims.tenantId, params.id);
  })
  .post("/:id/family", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getResidentRow(claims.tenantId, params.id);
    const parsed = createFamilyMemberSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(residentFamilyMembers).values({
      id,
      tenantId: claims.tenantId,
      residentId: params.id,
      name: parsed.name,
      relationship: parsed.relationship,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.RESIDENT_FAMILY_ADDED,
      entityType: AuditEntity.RESIDENT,
      entityId: params.id,
      message: `Added family member ${parsed.name} (${parsed.relationship})`,
      meta: { familyMemberId: id, relationship: parsed.relationship },
    });
    return listFamilyMembers(claims.tenantId, params.id);
  })
  .patch("/:id/family/:familyId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getResidentRow(claims.tenantId, params.id);
    const parsed = updateFamilyMemberSchema.parse(body);
    const [existing] = await db
      .select()
      .from(residentFamilyMembers)
      .where(
        and(
          eq(residentFamilyMembers.id, params.familyId),
          eq(residentFamilyMembers.tenantId, claims.tenantId),
          eq(residentFamilyMembers.residentId, params.id),
          eq(residentFamilyMembers.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Family member not found");

    await db
      .update(residentFamilyMembers)
      .set({
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.relationship !== undefined
          ? { relationship: parsed.relationship }
          : {}),
        ...(parsed.phone !== undefined ? { phone: parsed.phone } : {}),
        ...(parsed.email !== undefined ? { email: parsed.email } : {}),
        updatedBy: claims.sub,
      })
      .where(eq(residentFamilyMembers.id, params.familyId));
    return listFamilyMembers(claims.tenantId, params.id);
  })
  .delete("/:id/family/:familyId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getResidentRow(claims.tenantId, params.id);
    const [existing] = await db
      .select()
      .from(residentFamilyMembers)
      .where(
        and(
          eq(residentFamilyMembers.id, params.familyId),
          eq(residentFamilyMembers.tenantId, claims.tenantId),
          eq(residentFamilyMembers.residentId, params.id),
          eq(residentFamilyMembers.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Family member not found");

    await softDelete(residentFamilyMembers, params.familyId, claims.sub);
    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.RESIDENT_FAMILY_REMOVED,
      entityType: AuditEntity.RESIDENT,
      entityId: params.id,
      message: `Removed family member ${existing.name}`,
      meta: { familyMemberId: params.familyId },
    });
    return listFamilyMembers(claims.tenantId, params.id);
  })

  // ---- Documents ----------------------------------------------------------
  .get("/:id/documents", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getResidentRow(claims.tenantId, params.id);
    return listDocuments(claims.tenantId, params.id);
  })
  .post("/:id/documents", async ({ auth, params, request }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const form = await request.formData();
    const meta = uploadDocumentMetaSchema.parse({
      docType: form.get("docType") ?? undefined,
      documentNumber: form.get("documentNumber") ?? undefined,
      expiresAt: form.get("expiresAt") ?? undefined,
    });
    await storeDocument({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: params.id,
      file: form.get("file"),
      meta,
    });
    return listDocuments(claims.tenantId, params.id);
  });

/** Document review + private file access, kept off the `/residents/:id` tree. */
export const adminDocumentRoutes = new Elysia({
  prefix: "/v1/admin/resident-documents",
})
  .use(authPlugin)
  .post("/:id/verify", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return reviewDocument({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      documentId: params.id,
      approved: true,
    });
  })
  .post("/:id/reject", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = rejectDocumentSchema.parse(body);
    return reviewDocument({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      documentId: params.id,
      approved: false,
      reason: parsed.reason,
    });
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getDocumentRow(claims.tenantId, params.id);
    const { verificationDocuments } = await import("../../db/schema");
    await softDelete(verificationDocuments, params.id, claims.sub);
    return { ok: true as const };
  })
  .get("/:id/file", async ({ auth, params, query }) => {
    // Browsers cannot set an Authorization header on <img>/<a>, so a short-lived
    // access token may travel in the query string — same pattern as /v1/media.
    let claims = auth;
    if (!claims && typeof query.access_token === "string") {
      try {
        const { verifyAccessToken } = await import("@society-hub/auth");
        claims = await verifyAccessToken(query.access_token, env.jwtSecret);
      } catch {
        claims = null;
      }
    }
    const resolved = requireAuth(claims);
    requireSocietyStaff(resolved);
    return readDocumentFile({
      tenantId: resolved.tenantId,
      actorUserId: resolved.sub,
      documentId: params.id,
    });
  });

/** Flat-centric admin views: occupancy now, and occupancy over time. */
export const adminFlatRoutes = new Elysia({ prefix: "/v1/admin/flats" })
  .use(authPlugin)
  .get("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return buildFlatDetail(claims.tenantId, params.id);
  })
  .get("/:id/residents", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getFlatWithStructure(claims.tenantId, params.id);
    return listFlatOccupants(claims.tenantId, params.id);
  })
  .get("/:id/history", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await getFlatWithStructure(claims.tenantId, params.id);
    return listFlatHistory(claims.tenantId, params.id);
  });

export const adminOccupancyRoutes = new Elysia({ prefix: "/v1/admin/occupancy" })
  .use(authPlugin)
  .get("/stats", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return occupancyStats(claims.tenantId);
  })
  .get("/flats", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = flatListQuerySchema.parse(query ?? {});
    return listFlatsWithOccupancy(claims.tenantId, parsed);
  });
