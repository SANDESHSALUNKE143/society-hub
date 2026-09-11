import { Elysia } from "elysia";
import { and, count, eq, inArray } from "drizzle-orm";
import {
  createBuildingSchema,
  createFlatSchema,
  createSocietySchema,
  createWingSchema,
  updateSocietyBasicsSchema,
} from "@society-hub/validation";
import type { SocietyDto } from "@society-hub/types";
import { hashPassword } from "@society-hub/auth";
import { db } from "../../db/client";
import {
  buildings,
  flats,
  societies,
  userRoles,
  users,
  wings,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { ActivityType, recordActivity } from "../../lib/audit";
import { softDelete } from "../../lib/soft-delete";
import { assertTenantAccess } from "../../lib/tenant-scope";
import {
  authPlugin,
  isPlatformRole,
  isSocietyStaffRole,
  requireAuth,
  requirePlatform,
  requireSocietyStaff,
} from "../../lib/auth-context";
import { syncFlatParkingSlot } from "../admin/onboard-resident";

const DEFAULT_CHAIR_PASSWORD = "Test@1234";

function parseDetails(raw: string | null): Record<string, string> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function buildSocietyDto(societyId: string): Promise<SocietyDto> {
  const [society] = await db
    .select()
    .from(societies)
    .where(and(eq(societies.id, societyId), eq(societies.isDeleted, false)))
    .limit(1);
  if (!society) throw new AppError(404, "not_found", "Society not found");

  const [chair] = await db
    .select({ name: users.name, email: users.email, phone: users.phone })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.userId))
    .where(
      and(
        eq(userRoles.tenantId, societyId),
        inArray(userRoles.role, ["chairperson", "admin"]),
        eq(userRoles.isDeleted, false),
        eq(users.isDeleted, false),
      ),
    )
    .limit(1);

  return {
    id: society.id,
    name: society.name,
    address: society.address,
    city: society.city,
    pincode: society.pincode,
    chairpersonName: chair?.name ?? null,
    chairpersonEmail: chair?.email ?? null,
    chairpersonPhone: chair?.phone ?? null,
    timezone: society.timezone,
    createdAt: society.createdAt,
  };
}

export const societyRoutes = new Elysia({ prefix: "/v1/societies" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const rows = await db
      .select()
      .from(societies)
      .where(eq(societies.isDeleted, false));
    return Promise.all(rows.map((r) => buildSocietyDto(r.id)));
  })
  .get("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    if (isPlatformRole(claims.role)) {
      /* platform may open any society */
    } else if (isSocietyStaffRole(claims.role)) {
      assertTenantAccess(claims, params.id);
    } else {
      throw new AppError(403, "forbidden", "Insufficient permissions");
    }
    return buildSocietyDto(params.id);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createSocietySchema.parse(body);

    const societyId = crypto.randomUUID();
    await db.insert(societies).values({
      id: societyId,
      name: parsed.name,
      address: parsed.address ?? null,
      city: parsed.city ?? null,
      pincode: parsed.pincode ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    // Structure (towers → wings → flats) is added next on Manage society detail.
    if (parsed.chairpersonEmail || parsed.chairpersonPhone) {
      const [existing] = parsed.chairpersonEmail
        ? await db
            .select()
            .from(users)
            .where(eq(users.email, parsed.chairpersonEmail))
            .limit(1)
        : await db
            .select()
            .from(users)
            .where(eq(users.phone, parsed.chairpersonPhone ?? ""))
            .limit(1);

      let chairUserId = existing?.id;
      if (!chairUserId) {
        chairUserId = crypto.randomUUID();
        const passwordHash = parsed.chairpersonEmail
          ? await hashPassword(DEFAULT_CHAIR_PASSWORD)
          : null;
        await db.insert(users).values({
          id: chairUserId,
          name: parsed.chairpersonName ?? null,
          email: parsed.chairpersonEmail ?? null,
          phone: parsed.chairpersonPhone ?? null,
          passwordHash,
        });
      }

      await db.insert(userRoles).values({
        id: crypto.randomUUID(),
        tenantId: societyId,
        userId: chairUserId,
        role: "chairperson",
        createdBy: claims.sub,
        updatedBy: claims.sub,
      });
    }

    recordActivity({
      tenantId: societyId,
      actorUserId: claims.sub,
      action: ActivityType.SOCIETY_CREATED,
      entityType: "society",
      entityId: societyId,
      message: `Created society "${parsed.name}"`,
      meta: { name: parsed.name },
    });

    return buildSocietyDto(societyId);
  })
  .patch("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = updateSocietyBasicsSchema.parse(body);
    const [existing] = await db
      .select({ id: societies.id })
      .from(societies)
      .where(and(eq(societies.id, params.id), eq(societies.isDeleted, false)))
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Society not found");

    await db
      .update(societies)
      .set({
        name: parsed.name,
        ...(parsed.address !== undefined ? { address: parsed.address } : {}),
        ...(parsed.city !== undefined ? { city: parsed.city } : {}),
        ...(parsed.pincode !== undefined ? { pincode: parsed.pincode } : {}),
        updatedBy: claims.sub,
      })
      .where(eq(societies.id, params.id));

    return buildSocietyDto(params.id);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    await softDelete(societies, params.id, claims.sub);
    return { ok: true as const };
  })
  .get("/:id/buildings", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    assertTenantAccess(claims, params.id);
    const rows = await db
      .select()
      .from(buildings)
      .where(and(eq(buildings.tenantId, params.id), eq(buildings.isDeleted, false)));
    return Promise.all(
      rows.map(async (b) => {
        const [wingCount] = await db
          .select({ total: count() })
          .from(wings)
          .where(and(eq(wings.buildingId, b.id), eq(wings.isDeleted, false)));
        return { id: b.id, name: b.name, wingCount: Number(wingCount?.total ?? 0) };
      }),
    );
  })
  .post("/:id/buildings", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    assertTenantAccess(claims, params.id);
    const parsed = createBuildingSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(buildings).values({
      id,
      tenantId: params.id,
      name: parsed.name,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    return { id, name: parsed.name };
  });

export const buildingRoutes = new Elysia({ prefix: "/v1/buildings" })
  .use(authPlugin)
  .get("/:id/wings", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [building] = await db
      .select()
      .from(buildings)
      .where(and(eq(buildings.id, params.id), eq(buildings.isDeleted, false)))
      .limit(1);
    if (!building) throw new AppError(404, "not_found", "Building not found");
    assertTenantAccess(claims, building.tenantId);

    const rows = await db
      .select()
      .from(wings)
      .where(and(eq(wings.buildingId, params.id), eq(wings.isDeleted, false)));
    return Promise.all(
      rows.map(async (w) => {
        const [flatCount] = await db
          .select({ total: count() })
          .from(flats)
          .where(and(eq(flats.wingId, w.id), eq(flats.isDeleted, false)));
        return {
          id: w.id,
          name: w.name,
          buildingId: w.buildingId,
          flatCount: Number(flatCount?.total ?? 0),
        };
      }),
    );
  })
  .post("/:id/wings", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [building] = await db
      .select()
      .from(buildings)
      .where(and(eq(buildings.id, params.id), eq(buildings.isDeleted, false)))
      .limit(1);
    if (!building) throw new AppError(404, "not_found", "Building not found");
    assertTenantAccess(claims, building.tenantId);

    const parsed = createWingSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(wings).values({
      id,
      tenantId: building.tenantId,
      buildingId: params.id,
      name: parsed.name,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    return { id, name: parsed.name, buildingId: params.id };
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [building] = await db
      .select()
      .from(buildings)
      .where(eq(buildings.id, params.id))
      .limit(1);
    if (!building) throw new AppError(404, "not_found", "Building not found");
    assertTenantAccess(claims, building.tenantId);
    await softDelete(buildings, params.id, claims.sub);
    return { ok: true as const };
  });

export const wingRoutes = new Elysia({ prefix: "/v1/wings" })
  .use(authPlugin)
  .get("/:id/flats", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [wing] = await db
      .select()
      .from(wings)
      .where(and(eq(wings.id, params.id), eq(wings.isDeleted, false)))
      .limit(1);
    if (!wing) throw new AppError(404, "not_found", "Wing not found");
    assertTenantAccess(claims, wing.tenantId);

    const rows = await db
      .select()
      .from(flats)
      .where(and(eq(flats.wingId, params.id), eq(flats.isDeleted, false)));
    return rows.map((f) => ({
      id: f.id,
      number: f.number,
      wingId: f.wingId,
      wingName: wing.name,
      floor: f.floor,
      parkingSlot: f.parkingSlot,
      pngGasConnection: Boolean(f.pngGasConnection),
      adultCount: f.adultCount ?? 0,
      childCount: f.childCount ?? 0,
      seniorCitizenCount: f.seniorCitizenCount ?? 0,
      details: parseDetails(f.detailsJson),
    }));
  })
  .post("/:id/flats", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [wing] = await db
      .select()
      .from(wings)
      .where(and(eq(wings.id, params.id), eq(wings.isDeleted, false)))
      .limit(1);
    if (!wing) throw new AppError(404, "not_found", "Wing not found");
    assertTenantAccess(claims, wing.tenantId);

    const parsed = createFlatSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(flats).values({
      id,
      tenantId: wing.tenantId,
      wingId: params.id,
      number: parsed.number,
      floor: parsed.floor ?? null,
      parkingSlot: parsed.parkingSlot ?? null,
      detailsJson: parsed.details ? JSON.stringify(parsed.details) : null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    await syncFlatParkingSlot({
      tenantId: wing.tenantId,
      flatId: id,
      parkingSlot: parsed.parkingSlot,
      actorUserId: claims.sub,
    });
    return {
      id,
      number: parsed.number,
      wingId: params.id,
      wingName: wing.name,
      floor: parsed.floor ?? null,
      parkingSlot: parsed.parkingSlot ?? null,
      details: parsed.details ?? null,
    };
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [wing] = await db
      .select()
      .from(wings)
      .where(eq(wings.id, params.id))
      .limit(1);
    if (!wing) throw new AppError(404, "not_found", "Wing not found");
    assertTenantAccess(claims, wing.tenantId);
    await softDelete(wings, params.id, claims.sub);
    return { ok: true as const };
  });

export const flatRoutes = new Elysia({ prefix: "/v1/flats" })
  .use(authPlugin)
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [flat] = await db
      .select()
      .from(flats)
      .where(eq(flats.id, params.id))
      .limit(1);
    if (!flat) throw new AppError(404, "not_found", "Flat not found");
    assertTenantAccess(claims, flat.tenantId);
    await softDelete(flats, params.id, claims.sub);
    return { ok: true as const };
  });
