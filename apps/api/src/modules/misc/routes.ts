import { Elysia } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import type {
  AssetDto,
  BookingDto,
  EventDto,
  ParkingSlotDto,
  VendorDto,
  VisitorDto,
} from "@society-hub/types";
import {
  createAssetSchema,
  createBookingSchema,
  createEventSchema,
  createParkingSlotSchema,
  createVendorSchema,
  createVisitorSchema,
} from "@society-hub/validation";
import { db } from "../../db/client";
import {
  assets,
  bookings,
  events,
  flats,
  parkingSlots,
  vendors,
  visitors,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { softDelete } from "../../lib/soft-delete";
import { authPlugin, requireAuth,
  requireSocietyStaff } from "../../lib/auth-context";

function toVisitorDto(row: typeof visitors.$inferSelect, flatNumber: string | null): VisitorDto {
  return {
    id: row.id,
    flatId: row.flatId,
    flatNumber,
    visitorName: row.visitorName,
    phone: row.phone,
    purpose: row.purpose,
    expectedAt: row.expectedAt,
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    createdAt: row.createdAt,
  };
}

export const visitorRoutes = new Elysia({ prefix: "/v1/visitors" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    const rows = await db
      .select({ visitor: visitors, flatNumber: flats.number })
      .from(visitors)
      .leftJoin(flats, eq(flats.id, visitors.flatId))
      .where(and(eq(visitors.tenantId, claims.tenantId), eq(visitors.isDeleted, false)))
      .orderBy(desc(visitors.createdAt));
    return rows.map((r) => toVisitorDto(r.visitor, r.flatNumber));
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = createVisitorSchema.parse(body);
    const flatId = parsed.flatId ?? claims.flatId;
    if (!flatId) {
      throw new AppError(400, "flat_required", "flatId is required");
    }
    const id = crypto.randomUUID();
    await db.insert(visitors).values({
      id,
      tenantId: claims.tenantId,
      flatId,
      visitorName: parsed.visitorName,
      phone: parsed.phone ?? null,
      purpose: parsed.purpose ?? null,
      expectedAt: parsed.expectedAt ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db
      .select({ visitor: visitors, flatNumber: flats.number })
      .from(visitors)
      .leftJoin(flats, eq(flats.id, visitors.flatId))
      .where(eq(visitors.id, id))
      .limit(1);
    return toVisitorDto(row!.visitor, row!.flatNumber);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    await softDelete(visitors, params.id, claims.sub);
    return { ok: true as const };
  });

function toParkingDto(
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

export const parkingRoutes = new Elysia({ prefix: "/v1/parking" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    const rows = await db
      .select({ slot: parkingSlots, flatNumber: flats.number })
      .from(parkingSlots)
      .leftJoin(flats, eq(flats.id, parkingSlots.flatId))
      .where(and(eq(parkingSlots.tenantId, claims.tenantId), eq(parkingSlots.isDeleted, false)));
    return rows.map((r) => toParkingDto(r.slot, r.flatNumber));
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createParkingSlotSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(parkingSlots).values({
      id,
      tenantId: claims.tenantId,
      flatId: parsed.flatId ?? null,
      slotNumber: parsed.slotNumber,
      vehicleNumber: parsed.vehicleNumber ?? null,
      type: parsed.type ?? "car",
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db
      .select({ slot: parkingSlots, flatNumber: flats.number })
      .from(parkingSlots)
      .leftJoin(flats, eq(flats.id, parkingSlots.flatId))
      .where(eq(parkingSlots.id, id))
      .limit(1);
    return toParkingDto(row!.slot, row!.flatNumber);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await softDelete(parkingSlots, params.id, claims.sub);
    return { ok: true as const };
  });

function toBookingDto(row: typeof bookings.$inferSelect): BookingDto {
  return {
    id: row.id,
    facilityName: row.facilityName,
    flatId: row.flatId,
    startAt: row.startAt,
    endAt: row.endAt,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export const bookingRoutes = new Elysia({ prefix: "/v1/bookings" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    const rows = await db
      .select()
      .from(bookings)
      .where(and(eq(bookings.tenantId, claims.tenantId), eq(bookings.isDeleted, false)))
      .orderBy(desc(bookings.startAt));
    return rows.map(toBookingDto);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = createBookingSchema.parse(body);
    const flatId = parsed.flatId ?? claims.flatId;
    if (!flatId) {
      throw new AppError(400, "flat_required", "flatId is required");
    }
    const id = crypto.randomUUID();
    await db.insert(bookings).values({
      id,
      tenantId: claims.tenantId,
      facilityName: parsed.facilityName,
      flatId,
      bookedByUserId: claims.sub,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      status: "confirmed",
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return toBookingDto(row!);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    await db
      .update(bookings)
      .set({ status: "cancelled", updatedBy: claims.sub })
      .where(and(eq(bookings.id, params.id), eq(bookings.tenantId, claims.tenantId)));
    await softDelete(bookings, params.id, claims.sub);
    return { ok: true as const };
  });

function toAssetDto(row: typeof assets.$inferSelect): AssetDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    location: row.location,
    purchaseDate: row.purchaseDate,
    value: row.value,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export const assetRoutes = new Elysia({ prefix: "/v1/assets" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const rows = await db
      .select()
      .from(assets)
      .where(and(eq(assets.tenantId, claims.tenantId), eq(assets.isDeleted, false)));
    return rows.map(toAssetDto);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createAssetSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(assets).values({
      id,
      tenantId: claims.tenantId,
      name: parsed.name,
      category: parsed.category ?? null,
      location: parsed.location ?? null,
      purchaseDate: parsed.purchaseDate ?? null,
      value: parsed.value ?? null,
      notes: parsed.notes ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
    return toAssetDto(row!);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await softDelete(assets, params.id, claims.sub);
    return { ok: true as const };
  });

function toVendorDto(row: typeof vendors.$inferSelect): VendorDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    phone: row.phone,
    email: row.email,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export const vendorRoutes = new Elysia({ prefix: "/v1/vendors" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const rows = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.tenantId, claims.tenantId), eq(vendors.isDeleted, false)));
    return rows.map(toVendorDto);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createVendorSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(vendors).values({
      id,
      tenantId: claims.tenantId,
      name: parsed.name,
      category: parsed.category ?? null,
      phone: parsed.phone ?? null,
      email: parsed.email ?? null,
      notes: parsed.notes ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    return toVendorDto(row!);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await softDelete(vendors, params.id, claims.sub);
    return { ok: true as const };
  });

function toEventDto(row: typeof events.$inferSelect): EventDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startAt: row.startAt,
    endAt: row.endAt,
    location: row.location,
    createdAt: row.createdAt,
  };
}

export const eventRoutes = new Elysia({ prefix: "/v1/events" })
  .use(authPlugin)
  .get("/", async ({ auth }) => {
    const claims = requireAuth(auth);
    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.tenantId, claims.tenantId), eq(events.isDeleted, false)))
      .orderBy(desc(events.startAt));
    return rows.map(toEventDto);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createEventSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(events).values({
      id,
      tenantId: claims.tenantId,
      title: parsed.title,
      description: parsed.description ?? null,
      startAt: parsed.startAt ?? null,
      endAt: parsed.endAt ?? null,
      location: parsed.location ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    return toEventDto(row!);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await softDelete(events, params.id, claims.sub);
    return { ok: true as const };
  });
