import { Elysia } from "elysia";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import type {
  AssetDto,
  BookingDto,
  EventDto,
  Paginated,
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
  listQuerySchema,
  updateAssetSchema,
  updateBookingStatusSchema,
  updateEventSchema,
  updateVendorSchema,
} from "@society-hub/validation";
import { db } from "../../db/client";
import {
  assets,
  bookings,
  eventRsvps,
  events,
  flats,
  parkingSlots,
  vendors,
  visitors,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { softDelete } from "../../lib/soft-delete";
import {
  authPlugin,
  isStaffRole,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";

function nowMysql() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

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
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const parsed = listQuerySchema.parse(query);
    const staff = isStaffRole(claims.role);
    const where = and(
      eq(visitors.tenantId, claims.tenantId),
      eq(visitors.isDeleted, false),
      staff ? undefined : eq(visitors.flatId, claims.flatId ?? ""),
    );
    const [totalRow] = await db.select({ total: count() }).from(visitors).where(where);
    const total = Number(totalRow?.total ?? 0);
    const rows = await db
      .select({ visitor: visitors, flatNumber: flats.number })
      .from(visitors)
      .leftJoin(flats, eq(flats.id, visitors.flatId))
      .where(where)
      .orderBy(desc(visitors.createdAt))
      .limit(parsed.limit)
      .offset((parsed.page - 1) * parsed.limit);
    const result: Paginated<VisitorDto> = {
      items: rows.map((r) => toVisitorDto(r.visitor, r.flatNumber)),
      page: parsed.page,
      limit: parsed.limit,
      total,
    };
    return result;
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = createVisitorSchema.parse(body);
    const flatId = parsed.flatId ?? claims.flatId;
    if (!flatId) throw new AppError(400, "flat_required", "flatId is required");
    if (!isStaffRole(claims.role) && flatId !== claims.flatId) {
      throw new AppError(403, "forbidden", "You can only register visitors for your flat");
    }
    const [flat] = await db
      .select()
      .from(flats)
      .where(and(eq(flats.id, flatId), eq(flats.tenantId, claims.tenantId), eq(flats.isDeleted, false)))
      .limit(1);
    if (!flat) throw new AppError(404, "flat_not_found", "Flat not found");

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
    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "visitor.created",
      entityType: "visitor",
      entityId: id,
    });
    const [row] = await db
      .select({ visitor: visitors, flatNumber: flats.number })
      .from(visitors)
      .leftJoin(flats, eq(flats.id, visitors.flatId))
      .where(eq(visitors.id, id))
      .limit(1);
    return toVisitorDto(row!.visitor, row!.flatNumber);
  })
  .post("/:id/check-in", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(visitors)
      .where(
        and(
          eq(visitors.id, params.id),
          eq(visitors.tenantId, claims.tenantId),
          eq(visitors.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Visitor not found");
    if (existing.checkedOutAt) {
      throw new AppError(409, "already_checked_out", "Visitor already checked out");
    }
    await db
      .update(visitors)
      .set({ checkedInAt: nowMysql(), updatedBy: claims.sub })
      .where(eq(visitors.id, params.id));
    const [row] = await db
      .select({ visitor: visitors, flatNumber: flats.number })
      .from(visitors)
      .leftJoin(flats, eq(flats.id, visitors.flatId))
      .where(eq(visitors.id, params.id))
      .limit(1);
    return toVisitorDto(row!.visitor, row!.flatNumber);
  })
  .post("/:id/check-out", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(visitors)
      .where(
        and(
          eq(visitors.id, params.id),
          eq(visitors.tenantId, claims.tenantId),
          eq(visitors.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Visitor not found");
    if (!existing.checkedInAt) {
      throw new AppError(409, "not_checked_in", "Visitor is not checked in");
    }
    await db
      .update(visitors)
      .set({ checkedOutAt: nowMysql(), updatedBy: claims.sub })
      .where(eq(visitors.id, params.id));
    const [row] = await db
      .select({ visitor: visitors, flatNumber: flats.number })
      .from(visitors)
      .leftJoin(flats, eq(flats.id, visitors.flatId))
      .where(eq(visitors.id, params.id))
      .limit(1);
    return toVisitorDto(row!.visitor, row!.flatNumber);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(visitors)
      .where(
        and(
          eq(visitors.id, params.id),
          eq(visitors.tenantId, claims.tenantId),
          eq(visitors.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Visitor not found");
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
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const parsed = listQuerySchema.parse(query);
    const staff = isStaffRole(claims.role);
    const where = and(
      eq(parkingSlots.tenantId, claims.tenantId),
      eq(parkingSlots.isDeleted, false),
      staff ? undefined : eq(parkingSlots.flatId, claims.flatId ?? ""),
    );
    const [totalRow] = await db.select({ total: count() }).from(parkingSlots).where(where);
    const total = Number(totalRow?.total ?? 0);
    const rows = await db
      .select({ slot: parkingSlots, flatNumber: flats.number })
      .from(parkingSlots)
      .leftJoin(flats, eq(flats.id, parkingSlots.flatId))
      .where(where)
      .limit(parsed.limit)
      .offset((parsed.page - 1) * parsed.limit);
    return {
      items: rows.map((r) => toParkingDto(r.slot, r.flatNumber)),
      page: parsed.page,
      limit: parsed.limit,
      total,
    } satisfies Paginated<ParkingSlotDto>;
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
  .post("/:id/assign", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const flatId = (body as { flatId?: string })?.flatId;
    if (!flatId) throw new AppError(400, "flat_required", "flatId is required");
    const [slot] = await db
      .select()
      .from(parkingSlots)
      .where(
        and(
          eq(parkingSlots.id, params.id),
          eq(parkingSlots.tenantId, claims.tenantId),
          eq(parkingSlots.isDeleted, false),
        ),
      )
      .limit(1);
    if (!slot) throw new AppError(404, "not_found", "Parking slot not found");
    const [flat] = await db
      .select()
      .from(flats)
      .where(and(eq(flats.id, flatId), eq(flats.tenantId, claims.tenantId), eq(flats.isDeleted, false)))
      .limit(1);
    if (!flat) throw new AppError(404, "flat_not_found", "Flat not found");
    await db
      .update(parkingSlots)
      .set({ flatId, updatedBy: claims.sub })
      .where(eq(parkingSlots.id, params.id));
    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "parking.assigned",
      entityType: "parking_slot",
      entityId: params.id,
      meta: { flatId },
    });
    return toParkingDto(
      { ...slot, flatId },
      flat.number,
    );
  })
  .post("/:id/release", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [slot] = await db
      .select()
      .from(parkingSlots)
      .where(
        and(
          eq(parkingSlots.id, params.id),
          eq(parkingSlots.tenantId, claims.tenantId),
          eq(parkingSlots.isDeleted, false),
        ),
      )
      .limit(1);
    if (!slot) throw new AppError(404, "not_found", "Parking slot not found");
    await db
      .update(parkingSlots)
      .set({ flatId: null, updatedBy: claims.sub })
      .where(eq(parkingSlots.id, params.id));
    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "parking.released",
      entityType: "parking_slot",
      entityId: params.id,
    });
    return toParkingDto({ ...slot, flatId: null }, null);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [slot] = await db
      .select()
      .from(parkingSlots)
      .where(
        and(
          eq(parkingSlots.id, params.id),
          eq(parkingSlots.tenantId, claims.tenantId),
          eq(parkingSlots.isDeleted, false),
        ),
      )
      .limit(1);
    if (!slot) throw new AppError(404, "not_found", "Parking slot not found");
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
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const parsed = listQuerySchema.parse(query);
    const staff = isStaffRole(claims.role);
    const where = and(
      eq(bookings.tenantId, claims.tenantId),
      eq(bookings.isDeleted, false),
      staff ? undefined : eq(bookings.bookedByUserId, claims.sub),
    );
    const [totalRow] = await db.select({ total: count() }).from(bookings).where(where);
    const total = Number(totalRow?.total ?? 0);
    const rows = await db
      .select()
      .from(bookings)
      .where(where)
      .orderBy(desc(bookings.startAt))
      .limit(parsed.limit)
      .offset((parsed.page - 1) * parsed.limit);
    return {
      items: rows.map(toBookingDto),
      page: parsed.page,
      limit: parsed.limit,
      total,
    } satisfies Paginated<BookingDto>;
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const parsed = createBookingSchema.parse(body);
    const flatId = parsed.flatId ?? claims.flatId;
    if (!flatId) throw new AppError(400, "flat_required", "flatId is required");
    if (parsed.endAt <= parsed.startAt) {
      throw new AppError(400, "invalid_range", "endAt must be after startAt");
    }
    const conflicts = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.tenantId, claims.tenantId),
          eq(bookings.facilityName, parsed.facilityName),
          eq(bookings.isDeleted, false),
          ne(bookings.status, "cancelled"),
          sql`${bookings.startAt} < ${parsed.endAt} AND ${bookings.endAt} > ${parsed.startAt}`,
        ),
      )
      .limit(1);
    if (conflicts.length) {
      throw new AppError(409, "booking_conflict", "That facility is already booked for this time");
    }
    const id = crypto.randomUUID();
    const status = isStaffRole(claims.role) ? "confirmed" : "pending";
    await db.insert(bookings).values({
      id,
      tenantId: claims.tenantId,
      facilityName: parsed.facilityName,
      flatId,
      bookedByUserId: claims.sub,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
      status,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
    return toBookingDto(row!);
  })
  .patch("/:id/status", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateBookingStatusSchema.parse(body);
    const [existing] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.id, params.id),
          eq(bookings.tenantId, claims.tenantId),
          eq(bookings.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Booking not found");
    await db
      .update(bookings)
      .set({ status: parsed.status, updatedBy: claims.sub })
      .where(eq(bookings.id, params.id));
    const [row] = await db.select().from(bookings).where(eq(bookings.id, params.id)).limit(1);
    return toBookingDto(row!);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [existing] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.id, params.id),
          eq(bookings.tenantId, claims.tenantId),
          eq(bookings.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Booking not found");
    if (!isStaffRole(claims.role) && existing.bookedByUserId !== claims.sub) {
      throw new AppError(404, "not_found", "Booking not found");
    }
    await db
      .update(bookings)
      .set({ status: "cancelled", updatedBy: claims.sub })
      .where(eq(bookings.id, params.id));
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
    nextServiceAt: row.nextServiceAt ?? null,
    value: row.value,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export const assetRoutes = new Elysia({ prefix: "/v1/assets" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = listQuerySchema.parse(query);
    const where = and(eq(assets.tenantId, claims.tenantId), eq(assets.isDeleted, false));
    const [totalRow] = await db.select({ total: count() }).from(assets).where(where);
    const total = Number(totalRow?.total ?? 0);
    const rows = await db
      .select()
      .from(assets)
      .where(where)
      .orderBy(desc(assets.createdAt))
      .limit(parsed.limit)
      .offset((parsed.page - 1) * parsed.limit);
    return {
      items: rows.map(toAssetDto),
      page: parsed.page,
      limit: parsed.limit,
      total,
    } satisfies Paginated<AssetDto>;
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
      nextServiceAt: parsed.nextServiceAt ?? null,
      value: parsed.value ?? null,
      notes: parsed.notes ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
    return toAssetDto(row!);
  })
  .patch("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateAssetSchema.parse(body);
    const [existing] = await db
      .select()
      .from(assets)
      .where(
        and(eq(assets.id, params.id), eq(assets.tenantId, claims.tenantId), eq(assets.isDeleted, false)),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Asset not found");
    await db
      .update(assets)
      .set({ ...parsed, updatedBy: claims.sub })
      .where(eq(assets.id, params.id));
    const [row] = await db.select().from(assets).where(eq(assets.id, params.id)).limit(1);
    return toAssetDto(row!);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(assets)
      .where(
        and(eq(assets.id, params.id), eq(assets.tenantId, claims.tenantId), eq(assets.isDeleted, false)),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Asset not found");
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
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = listQuerySchema.parse(query);
    const where = and(eq(vendors.tenantId, claims.tenantId), eq(vendors.isDeleted, false));
    const [totalRow] = await db.select({ total: count() }).from(vendors).where(where);
    const total = Number(totalRow?.total ?? 0);
    const rows = await db
      .select()
      .from(vendors)
      .where(where)
      .orderBy(desc(vendors.createdAt))
      .limit(parsed.limit)
      .offset((parsed.page - 1) * parsed.limit);
    return {
      items: rows.map(toVendorDto),
      page: parsed.page,
      limit: parsed.limit,
      total,
    } satisfies Paginated<VendorDto>;
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
  .patch("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateVendorSchema.parse(body);
    const [existing] = await db
      .select()
      .from(vendors)
      .where(
        and(eq(vendors.id, params.id), eq(vendors.tenantId, claims.tenantId), eq(vendors.isDeleted, false)),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Vendor not found");
    await db
      .update(vendors)
      .set({ ...parsed, updatedBy: claims.sub })
      .where(eq(vendors.id, params.id));
    const [row] = await db.select().from(vendors).where(eq(vendors.id, params.id)).limit(1);
    return toVendorDto(row!);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(vendors)
      .where(
        and(eq(vendors.id, params.id), eq(vendors.tenantId, claims.tenantId), eq(vendors.isDeleted, false)),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Vendor not found");
    await softDelete(vendors, params.id, claims.sub);
    return { ok: true as const };
  });

function toEventDto(
  row: typeof events.$inferSelect,
  rsvpCount: number,
  iAmGoing: boolean,
): EventDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startAt: row.startAt,
    endAt: row.endAt,
    location: row.location,
    capacity: row.capacity ?? null,
    rsvpCount,
    iAmGoing,
    createdAt: row.createdAt,
  };
}

export const eventRoutes = new Elysia({ prefix: "/v1/events" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const parsed = listQuerySchema.parse(query);
    const where = and(eq(events.tenantId, claims.tenantId), eq(events.isDeleted, false));
    const [totalRow] = await db.select({ total: count() }).from(events).where(where);
    const total = Number(totalRow?.total ?? 0);
    const rows = await db
      .select()
      .from(events)
      .where(where)
      .orderBy(desc(events.startAt))
      .limit(parsed.limit)
      .offset((parsed.page - 1) * parsed.limit);
    const items = await Promise.all(
      rows.map(async (row) => {
        const [countRow] = await db
          .select({ c: count() })
          .from(eventRsvps)
          .where(
            and(
              eq(eventRsvps.eventId, row.id),
              eq(eventRsvps.isDeleted, false),
            ),
          );
        const [mine] = await db
          .select()
          .from(eventRsvps)
          .where(
            and(
              eq(eventRsvps.eventId, row.id),
              eq(eventRsvps.userId, claims.sub),
              eq(eventRsvps.isDeleted, false),
            ),
          )
          .limit(1);
        return toEventDto(row, Number(countRow?.c ?? 0), Boolean(mine));
      }),
    );
    return {
      items,
      page: parsed.page,
      limit: parsed.limit,
      total,
    } satisfies Paginated<EventDto>;
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
      capacity: parsed.capacity ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
    return toEventDto(row!, 0, false);
  })
  .patch("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateEventSchema.parse(body);
    const [existing] = await db
      .select()
      .from(events)
      .where(
        and(eq(events.id, params.id), eq(events.tenantId, claims.tenantId), eq(events.isDeleted, false)),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Event not found");
    await db
      .update(events)
      .set({ ...parsed, updatedBy: claims.sub })
      .where(eq(events.id, params.id));
    const [row] = await db.select().from(events).where(eq(events.id, params.id)).limit(1);
    return toEventDto(row!, 0, false);
  })
  .post("/:id/rsvp", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [event] = await db
      .select()
      .from(events)
      .where(
        and(eq(events.id, params.id), eq(events.tenantId, claims.tenantId), eq(events.isDeleted, false)),
      )
      .limit(1);
    if (!event) throw new AppError(404, "not_found", "Event not found");
    const [countRow] = await db
          .select({ c: count() })
      .from(eventRsvps)
      .where(and(eq(eventRsvps.eventId, event.id), eq(eventRsvps.isDeleted, false)));
    if (event.capacity != null && Number(countRow?.c ?? 0) >= event.capacity) {
      throw new AppError(409, "capacity_full", "This event is at capacity");
    }
    const [existing] = await db
      .select()
      .from(eventRsvps)
      .where(
        and(
          eq(eventRsvps.eventId, event.id),
          eq(eventRsvps.userId, claims.sub),
          eq(eventRsvps.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) {
      await db.insert(eventRsvps).values({
        id: crypto.randomUUID(),
        tenantId: claims.tenantId,
        eventId: event.id,
        userId: claims.sub,
        createdBy: claims.sub,
        updatedBy: claims.sub,
      });
    }
    return toEventDto(event, Number(countRow?.c ?? 0) + (existing ? 0 : 1), true);
  })
  .delete("/:id/rsvp", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [existing] = await db
      .select()
      .from(eventRsvps)
      .where(
        and(
          eq(eventRsvps.eventId, params.id),
          eq(eventRsvps.userId, claims.sub),
          eq(eventRsvps.tenantId, claims.tenantId),
          eq(eventRsvps.isDeleted, false),
        ),
      )
      .limit(1);
    if (existing) await softDelete(eventRsvps, existing.id, claims.sub);
    return { ok: true as const };
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(events)
      .where(
        and(eq(events.id, params.id), eq(events.tenantId, claims.tenantId), eq(events.isDeleted, false)),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Event not found");
    await softDelete(events, params.id, claims.sub);
    return { ok: true as const };
  });
