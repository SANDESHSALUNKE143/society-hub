import { Elysia } from "elysia";
import { and, count, eq } from "drizzle-orm";
import {
  addSocietyTeamMemberSchema,
  createInvitationSchema,
  onboardResidentSchema,
  residentImportSchema,
  updateSocietyTeamMemberSchema,
} from "@society-hub/validation";
import type { FlatDto } from "@society-hub/types";
import { db } from "../../db/client";
import { buildings, flats, residentVehicles, residents, wings } from "../../db/schema";
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
import { removeResidentFromTenant } from "./remove-resident";
import { importResidentsCsvRows } from "./import-residents";
import { listResidentsForTenant } from "./list-residents";
import { listSocietyParkings } from "../manage/parking-service";

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
    pngGasConnection?: boolean | number | null;
    adultCount?: number | null;
    childCount?: number | null;
    seniorCitizenCount?: number | null;
    detailsJson: string | null;
  },
  wingName: string | null,
  vehicleCounts?: { twoWheelerCount: number; fourWheelerCount: number },
): FlatDto {
  return {
    id: row.id,
    number: row.number,
    wingId: row.wingId,
    wingName,
    floor: row.floor,
    parkingSlot: row.parkingSlot,
    pngGasConnection: Boolean(row.pngGasConnection),
    twoWheelerCount: vehicleCounts?.twoWheelerCount ?? 0,
    fourWheelerCount: vehicleCounts?.fourWheelerCount ?? 0,
    adultCount: row.adultCount ?? 0,
    childCount: row.childCount ?? 0,
    seniorCitizenCount: row.seniorCitizenCount ?? 0,
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
    const [rows, countRows] = await Promise.all([
      db
        .select({
          id: flats.id,
          number: flats.number,
          wingId: flats.wingId,
          floor: flats.floor,
          parkingSlot: flats.parkingSlot,
          pngGasConnection: flats.pngGasConnection,
          adultCount: flats.adultCount,
          childCount: flats.childCount,
          seniorCitizenCount: flats.seniorCitizenCount,
          detailsJson: flats.detailsJson,
          wingName: wings.name,
        })
        .from(flats)
        .leftJoin(wings, eq(wings.id, flats.wingId))
        .where(
          and(eq(flats.tenantId, claims.tenantId), eq(flats.isDeleted, false)),
        ),
      db
        .select({
          flatId: residents.flatId,
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
            eq(residentVehicles.tenantId, claims.tenantId),
            eq(residentVehicles.isDeleted, false),
            eq(residents.isDeleted, false),
          ),
        )
        .groupBy(residents.flatId, residentVehicles.kind),
    ]);
    const countsByFlat = new Map<string, { twoWheelerCount: number; fourWheelerCount: number }>();
    for (const row of countRows) {
      const cur = countsByFlat.get(row.flatId) ?? {
        twoWheelerCount: 0,
        fourWheelerCount: 0,
      };
      if (row.kind === "two_wheeler") cur.twoWheelerCount = Number(row.n);
      if (row.kind === "four_wheeler") cur.fourWheelerCount = Number(row.n);
      countsByFlat.set(row.flatId, cur);
    }
    return rows.map((r) =>
      toFlatDto(
        {
          id: r.id,
          number: r.number,
          wingId: r.wingId,
          floor: r.floor,
          parkingSlot: r.parkingSlot,
          pngGasConnection: r.pngGasConnection,
          adultCount: r.adultCount,
          childCount: r.childCount,
          seniorCitizenCount: r.seniorCitizenCount,
          detailsJson: r.detailsJson,
        },
        r.wingName,
        countsByFlat.get(r.id),
      ),
    );
  })
  .get("/parkings", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return listSocietyParkings(claims.tenantId);
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
  .get("/residents", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return listResidentsForTenant(claims.tenantId);
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
      floor: parsed.floor,
      parkingSlot: parsed.parkingSlot,
      parkingSlotId: parsed.parkingSlotId,
      isOwner: parsed.isOwner,
      editOwner: parsed.editOwner,
      editUserId: parsed.editUserId,
      emergencyContact: parsed.emergencyContact,
      vehicleNumber: parsed.vehicleNumber,
      vehicles: parsed.vehicles,
      pngGasConnection: parsed.pngGasConnection,
      adultCount: parsed.adultCount,
      childCount: parsed.childCount,
      seniorCitizenCount: parsed.seniorCitizenCount,
    });
  })
  .post("/residents/import", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    // Validate early so bad payloads return 400 before import loop.
    residentImportSchema.parse(body);
    return importResidentsCsvRows(claims.tenantId, claims.sub, body);
  })
  .delete("/residents/:userId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    return removeResidentFromTenant({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      userId: params.userId,
    });
  });
