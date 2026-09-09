import { Elysia } from "elysia";
import { and, eq } from "drizzle-orm";
import {
  addSocietyTeamMemberSchema,
  createInvitationSchema,
  onboardResidentSchema,
  residentImportSchema,
  updateSocietyTeamMemberSchema,
} from "@society-hub/validation";
import type { FlatDto } from "@society-hub/types";
import { db } from "../../db/client";
import { buildings, flats, wings } from "../../db/schema";
import {
  addTeamMemberToTenant,
  listTeamForTenant,
  removeTeamMemberFromTenant,
  updateTeamMemberInTenant,
} from "./team-service";
import { createInvitationForTenant } from "../invitations/routes";
import {
  authPlugin,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";
import { onboardResidentIntoTenant } from "./onboard-resident";
import { importResidentsCsvRows } from "./import-residents";

function parseDetails(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toFlatDto(
  row: {
    id: string;
    number: string;
    wingId: string;
    floor: number | null;
    parkingSlot: string | null;
    detailsJson: string | null;
  },
  wingName: string | null,
): FlatDto {
  return {
    id: row.id,
    number: row.number,
    wingId: row.wingId,
    wingName,
    floor: row.floor,
    parkingSlot: row.parkingSlot,
    details: parseDetails(row.detailsJson),
  };
}

export const teamRoutes = new Elysia({ prefix: "/v1/team" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return listTeamForTenant(claims.tenantId);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = addSocietyTeamMemberSchema.parse(body);
    return addTeamMemberToTenant(claims.tenantId, claims.sub, parsed);
  })
  .patch("/:userId", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateSocietyTeamMemberSchema.parse(body);
    return updateTeamMemberInTenant(
      claims.tenantId,
      claims.sub,
      params.userId,
      parsed,
    );
  })
  .delete("/:userId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return removeTeamMemberFromTenant(claims.tenantId, claims.sub, params.userId);
  });

export const adminRoutes = new Elysia({ prefix: "/v1/admin" })
  .use(authPlugin)
  .get("/flats", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const rows = await db
      .select({
        id: flats.id,
        number: flats.number,
        wingId: flats.wingId,
        floor: flats.floor,
        parkingSlot: flats.parkingSlot,
        detailsJson: flats.detailsJson,
        wingName: wings.name,
      })
      .from(flats)
      .leftJoin(wings, eq(wings.id, flats.wingId))
      .where(
        and(eq(flats.tenantId, claims.tenantId), eq(flats.isDeleted, false)),
      );
    return rows.map((r) =>
      toFlatDto(
        {
          id: r.id,
          number: r.number,
          wingId: r.wingId,
          floor: r.floor,
          parkingSlot: r.parkingSlot,
          detailsJson: r.detailsJson,
        },
        r.wingName,
      ),
    );
  })
  .get("/structure", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);

    const [buildingRows, wingRows, flatRows] = await Promise.all([
      db
        .select()
        .from(buildings)
        .where(
          and(eq(buildings.tenantId, claims.tenantId), eq(buildings.isDeleted, false)),
        ),
      db
        .select()
        .from(wings)
        .where(and(eq(wings.tenantId, claims.tenantId), eq(wings.isDeleted, false))),
      db
        .select()
        .from(flats)
        .where(and(eq(flats.tenantId, claims.tenantId), eq(flats.isDeleted, false))),
    ]);

    return {
      buildings: buildingRows.map((b) => ({
        id: b.id,
        name: b.name,
        wings: wingRows
          .filter((w) => w.buildingId === b.id)
          .map((w) => ({
            id: w.id,
            name: w.name,
            buildingId: w.buildingId,
            flats: flatRows
              .filter((f) => f.wingId === w.id)
              .map((f) => toFlatDto(f, w.name)),
          })),
      })),
    };
  })
  .get("/team", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return listTeamForTenant(claims.tenantId);
  })
  .post("/invites", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createInvitationSchema.parse(body);
    return createInvitationForTenant(claims.tenantId, claims.sub, parsed);
  })
  .post("/residents", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = onboardResidentSchema.parse(body);
    return onboardResidentIntoTenant({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email,
      flatId: parsed.flatId,
    });
  })
  .post("/residents/import", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    // Validate early so bad payloads return 400 before import loop.
    residentImportSchema.parse(body);
    return importResidentsCsvRows(claims.tenantId, claims.sub, body);
  });
