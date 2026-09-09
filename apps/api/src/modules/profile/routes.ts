import { Elysia } from "elysia";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { ResidentProfileDto } from "@society-hub/types";
import {
  updateResidentProfileSchema,
  uploadDocumentMetaSchema,
} from "@society-hub/validation";
import { db } from "../../db/client";
import {
  buildings,
  flats,
  residentProfiles,
  residents,
  societies,
  users,
  wings,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { authPlugin, requireAuth } from "../../lib/auth-context";
import {
  listDocuments,
  listFamilyMembers,
  parseCommunicationPreferences,
} from "../residents/repository";
import {
  getDocumentRow,
  readDocumentFile,
  storeDocument,
} from "../residents/documents";
import { upsertProfile } from "./upsert-profile";

/** Shared with auth/routes.ts so `PATCH /v1/auth/profile` (used by the SDK) stays in sync. */
export { upsertProfile };

/** The signed-in user's live membership in the current society, if any. */
async function findOwnMembership(tenantId: string, userId: string) {
  const [row] = await db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, tenantId),
        eq(residents.userId, userId),
        eq(residents.isDeleted, false),
        isNotNull(residents.activeKey),
      ),
    )
    .orderBy(desc(residents.isPrimary), desc(residents.moveInDate))
    .limit(1);
  return row ?? null;
}

export async function getProfileDto(
  tenantId: string,
  userId: string,
): Promise<ResidentProfileDto> {
  const [[profile], [society], [user], membership] = await Promise.all([
    db
      .select()
      .from(residentProfiles)
      .where(
        and(
          eq(residentProfiles.tenantId, tenantId),
          eq(residentProfiles.userId, userId),
          eq(residentProfiles.isDeleted, false),
        ),
      )
      .limit(1),
    db
      .select({ name: societies.name })
      .from(societies)
      .where(and(eq(societies.id, tenantId), eq(societies.isDeleted, false)))
      .limit(1),
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    findOwnMembership(tenantId, userId),
  ]);

  const [flatRow] = membership
    ? await db
        .select({
          id: flats.id,
          number: flats.number,
          floor: flats.floor,
          parkingSlot: flats.parkingSlot,
          wingName: wings.name,
          buildingName: buildings.name,
        })
        .from(flats)
        .leftJoin(wings, eq(wings.id, flats.wingId))
        .leftJoin(buildings, eq(buildings.id, wings.buildingId))
        .where(and(eq(flats.id, membership.flatId), eq(flats.isDeleted, false)))
        .limit(1)
    : [];

  const [family, documents] = membership
    ? await Promise.all([
        listFamilyMembers(tenantId, membership.id),
        listDocuments(tenantId, membership.id),
      ])
    : [[], []];

  return {
    userId,
    name: user?.name ?? null,
    phone: user?.phone ?? null,
    email: user?.email ?? null,
    emergencyContact: profile?.emergencyContact ?? null,
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactRelation: profile?.emergencyContactRelation ?? null,
    emergencyContactPhone: profile?.emergencyContactPhone ?? null,
    vehicleNumber: profile?.vehicleNumber ?? null,
    communicationPreferences: parseCommunicationPreferences(
      profile?.communicationPrefsJson,
    ),
    societyName: society?.name ?? null,
    membership: membership
      ? {
          id: membership.id,
          residentType: membership.residentType,
          isPrimary: Boolean(membership.isPrimary),
          status: membership.status,
          verificationStatus: membership.verificationStatus,
          rejectionReason: membership.rejectionReason,
          moveInDate: membership.moveInDate,
          moveOutDate: membership.moveOutDate,
        }
      : null,
    family,
    // Residents see their own documents' metadata; the file itself still
    // requires a separate authenticated fetch.
    documents: documents.map((d) => ({
      ...d,
      downloadPath: `/v1/profile/documents/${d.id}/file`,
    })),
    flat: flatRow
      ? {
          id: flatRow.id,
          number: flatRow.number,
          wingName: flatRow.wingName ?? null,
          buildingName: flatRow.buildingName ?? null,
          floor: flatRow.floor ?? null,
          parkingSlot: flatRow.parkingSlot ?? null,
          isOwner: membership?.residentType === "owner",
        }
      : null,
  };
}

export const profileRoutes = new Elysia({ prefix: "/v1/profile" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    return getProfileDto(claims.tenantId, claims.sub);
  })
  .patch("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = updateResidentProfileSchema.parse(body);
    if (parsed.name !== undefined) {
      await db
        .update(users)
        .set({ name: parsed.name, updatedBy: claims.sub })
        .where(eq(users.id, claims.sub));
    }
    await upsertProfile(claims.tenantId, claims.sub, parsed);
    return getProfileDto(claims.tenantId, claims.sub);
  })
  /** Residents upload their own verification documents; admins review them. */
  .post("/documents", async ({ auth, request }) => {
    const claims = requireAuth(auth);
    const membership = await findOwnMembership(claims.tenantId, claims.sub);
    if (!membership) {
      throw new AppError(
        404,
        "no_membership",
        "You are not linked to a flat in this society yet",
      );
    }
    const form = await request.formData();
    const meta = uploadDocumentMetaSchema.parse({
      docType: form.get("docType") ?? undefined,
      documentNumber: form.get("documentNumber") ?? undefined,
      expiresAt: form.get("expiresAt") ?? undefined,
    });
    const dto = await storeDocument({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      residentId: membership.id,
      file: form.get("file"),
      meta,
    });
    return { ...dto, downloadPath: `/v1/profile/documents/${dto.id}/file` };
  })
  /** A resident may re-read only their own documents. */
  .get("/documents/:id/file", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const doc = await getDocumentRow(claims.tenantId, params.id);
    const owner = await db
      .select({ userId: residents.userId })
      .from(residents)
      .where(
        and(
          eq(residents.id, doc.residentId),
          eq(residents.tenantId, claims.tenantId),
        ),
      )
      .limit(1);
    if (owner[0]?.userId !== claims.sub) {
      throw new AppError(403, "forbidden", "Not your document");
    }
    return readDocumentFile({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      documentId: params.id,
    });
  });
