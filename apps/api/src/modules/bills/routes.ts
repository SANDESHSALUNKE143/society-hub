import { Elysia } from "elysia";
import { and, count, desc, eq } from "drizzle-orm";
import type { BillDto, BillLineItemDto, BillResidentDto, PaymentDto } from "@society-hub/types";
import { generateBillsSchema, listQuerySchema } from "@society-hub/validation";
import { db } from "../../db/client";
import { billLineItems, bills, flats, payments } from "../../db/schema";
import { toApiIsoDateTime } from "../../lib/api-datetime";
import { AppError } from "../../lib/errors";
import { ActivityType, recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import {
  authPlugin,
  isStaffRole,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";
import { generateReceiptNumber, toPaymentDto } from "../payments/routes";
import { listFlatOccupants } from "../residents/repository";

function toBillResident(o: {
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  residentType: BillResidentDto["residentType"];
  isPrimary: boolean;
}): BillResidentDto {
  return {
    userId: o.userId,
    name: o.name,
    phone: o.phone,
    email: o.email,
    residentType: o.residentType,
    isPrimary: o.isPrimary,
  };
}

function pickOwnerAndOccupants(occupants: Awaited<ReturnType<typeof listFlatOccupants>>): {
  owner: BillResidentDto | null;
  occupants: BillResidentDto[];
} {
  const owners = occupants.filter((o) => o.residentType === "owner");
  const ownerRow = owners.find((o) => o.isPrimary) ?? owners[0] ?? null;
  const owner = ownerRow ? toBillResident(ownerRow) : null;
  const others = occupants
    .filter((o) => !ownerRow || o.residentId !== ownerRow.residentId)
    .map(toBillResident);
  return { owner, occupants: others };
}

function toBillDto(
  row: typeof bills.$inferSelect,
  flatNumber: string,
  detail?: {
    lineItems: BillLineItemDto[];
    payments: PaymentDto[];
    owner: BillResidentDto | null;
    occupants: BillResidentDto[];
  },
): BillDto {
  return {
    id: row.id,
    flatId: row.flatId,
    flatNumber,
    periodYm: row.periodYm,
    amountPaise: row.amountPaise,
    status: row.status,
    notes: row.notes,
    createdAt: toApiIsoDateTime(row.createdAt),
    ...(detail
      ? {
          lineItems: detail.lineItems,
          payments: detail.payments,
          owner: detail.owner,
          occupants: detail.occupants,
        }
      : {}),
  };
}

async function loadBillWithFlat(billId: string, tenantId: string) {
  const [row] = await db
    .select({ bill: bills, flatNumber: flats.number })
    .from(bills)
    .innerJoin(flats, eq(flats.id, bills.flatId))
    .where(
      and(eq(bills.id, billId), eq(bills.tenantId, tenantId), eq(bills.isDeleted, false)),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Bill not found");
  return row;
}

async function loadBillDetail(billId: string, tenantId: string): Promise<BillDto> {
  const { bill, flatNumber } = await loadBillWithFlat(billId, tenantId);
  const [lineRows, paymentRows, flatOccupants] = await Promise.all([
    db
      .select()
      .from(billLineItems)
      .where(
        and(
          eq(billLineItems.billId, billId),
          eq(billLineItems.tenantId, tenantId),
          eq(billLineItems.isDeleted, false),
        ),
      )
      .orderBy(billLineItems.createdAt),
    db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.billId, billId),
          eq(payments.tenantId, tenantId),
          eq(payments.isDeleted, false),
        ),
      )
      .orderBy(desc(payments.createdAt)),
    listFlatOccupants(tenantId, bill.flatId),
  ]);
  const { owner, occupants } = pickOwnerAndOccupants(flatOccupants);
  return toBillDto(bill, flatNumber, {
    lineItems: lineRows.map((li) => ({
      id: li.id,
      label: li.label,
      amountPaise: li.amountPaise,
    })),
    payments: paymentRows.map((p) => toPaymentDto(p, flatNumber)),
    owner,
    occupants,
  });
}

export const billRoutes = new Elysia({ prefix: "/v1/bills" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const q = listQuerySchema.parse(query);
    const offset = (q.page - 1) * q.limit;
    const where = and(eq(bills.tenantId, claims.tenantId), eq(bills.isDeleted, false));

    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(bills)
      .where(where);

    const rows = await db
      .select({ bill: bills, flatNumber: flats.number })
      .from(bills)
      .innerJoin(flats, eq(flats.id, bills.flatId))
      .where(where)
      .orderBy(desc(bills.createdAt))
      .limit(q.limit)
      .offset(offset);

    return {
      items: rows.map((r) => toBillDto(r.bill, r.flatNumber)),
      page: q.page,
      limit: q.limit,
      total: Number(total),
    };
  })
  .get("/mine", async ({ auth }) => {
    const claims = requireAuth(auth);
    if (!claims.flatId) return [] as BillDto[];
    const rows = await db
      .select({ bill: bills, flatNumber: flats.number })
      .from(bills)
      .innerJoin(flats, eq(flats.id, bills.flatId))
      .where(
        and(
          eq(bills.tenantId, claims.tenantId),
          eq(bills.flatId, claims.flatId),
          eq(bills.isDeleted, false),
        ),
      )
      .orderBy(desc(bills.createdAt));
    return rows.map((r) => toBillDto(r.bill, r.flatNumber));
  })
  .post("/generate", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = generateBillsSchema.parse(body);

    let flatRows = await db
      .select()
      .from(flats)
      .where(and(eq(flats.tenantId, claims.tenantId), eq(flats.isDeleted, false)));

    if (parsed.flatIds && parsed.flatIds.length > 0) {
      const want = new Set(parsed.flatIds);
      flatRows = flatRows.filter((f) => want.has(f.id));
      if (flatRows.length === 0) {
        throw new AppError(400, "invalid_flats", "No matching flats found for this society");
      }
    }

    const existingRows = await db
      .select({ flatId: bills.flatId })
      .from(bills)
      .where(
        and(
          eq(bills.tenantId, claims.tenantId),
          eq(bills.periodYm, parsed.periodYm),
          eq(bills.isDeleted, false),
        ),
      );
    const already = new Set(existingRows.map((r) => r.flatId));

    const lineLabel = `${parsed.reason} · ${parsed.periodYm}`;
    const notes = parsed.notes?.trim() ? parsed.notes.trim() : null;

    let created = 0;
    for (const flat of flatRows) {
      if (already.has(flat.id)) continue;
      const billId = crypto.randomUUID();
      await db.insert(bills).values({
        id: billId,
        tenantId: claims.tenantId,
        flatId: flat.id,
        periodYm: parsed.periodYm,
        amountPaise: parsed.amountPaise,
        status: "issued",
        notes,
        createdBy: claims.sub,
        updatedBy: claims.sub,
      });
      await db.insert(billLineItems).values({
        id: crypto.randomUUID(),
        tenantId: claims.tenantId,
        billId,
        label: lineLabel,
        amountPaise: parsed.amountPaise,
        createdBy: claims.sub,
        updatedBy: claims.sub,
      });
      created += 1;
    }

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "bill.generated",
      entityType: "bill",
      entityId: parsed.periodYm,
      meta: {
        periodYm: parsed.periodYm,
        amountPaise: parsed.amountPaise,
        reason: parsed.reason,
        created,
        flatCount: flatRows.length,
      },
    });

    return { created };
  })
  .get("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const detail = await loadBillDetail(params.id, claims.tenantId);
    if (!isStaffRole(claims.role) && detail.flatId !== claims.flatId) {
      throw new AppError(404, "not_found", "Bill not found");
    }
    return detail;
  })
  .post("/:id/notify", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const { bill, flatNumber } = await loadBillWithFlat(params.id, claims.tenantId);
    if (bill.status === "void" || bill.status === "corrected") {
      throw new AppError(400, "invalid_status", "Cannot notify for a void or corrected bill");
    }
    const flatOccupants = await listFlatOccupants(claims.tenantId, bill.flatId);
    if (flatOccupants.length === 0) {
      throw new AppError(400, "no_recipients", "No current residents on this flat to notify");
    }
    const amount = `₹${(bill.amountPaise / 100).toFixed(2)}`;
    const title =
      bill.status === "paid"
        ? `Bill paid · ${bill.periodYm}`
        : `Maintenance due · ${bill.periodYm}`;
    const body =
      bill.status === "paid"
        ? `Flat ${flatNumber}: ${amount} for ${bill.periodYm} is marked paid.`
        : `Flat ${flatNumber}: ${amount} is due for ${bill.periodYm}. Open Bills to pay offline.`;

    const notifiedUserIds = new Set<string>();
    for (const occ of flatOccupants) {
      if (notifiedUserIds.has(occ.userId)) continue;
      notifiedUserIds.add(occ.userId);
      await notifyUser({
        tenantId: claims.tenantId,
        userId: occ.userId,
        title,
        body,
        kind: "payment",
        linkPath: "/bills",
      });
    }

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: ActivityType.BILL_NOTIFIED,
      entityType: "bill",
      entityId: bill.id,
      meta: { notified: notifiedUserIds.size, periodYm: bill.periodYm },
    });

    return { ok: true as const, notified: notifiedUserIds.size };
  })
  .post("/:id/pay", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const { bill, flatNumber } = await loadBillWithFlat(params.id, claims.tenantId);
    if (!isStaffRole(claims.role) && bill.flatId !== claims.flatId) {
      throw new AppError(404, "not_found", "Bill not found");
    }
    if (bill.status === "paid") {
      throw new AppError(400, "already_paid", "Bill is already paid");
    }

    // Mock Razorpay: in production this would create a real order and be
    // confirmed via the signed webhook; locally we settle instantly.
    const paymentId = crypto.randomUUID();
    const receiptNumber = generateReceiptNumber();
    await db.insert(payments).values({
      id: paymentId,
      tenantId: claims.tenantId,
      billId: bill.id,
      flatId: bill.flatId,
      amountPaise: bill.amountPaise,
      method: "razorpay",
      status: "success",
      razorpayOrderId: `order_dev_${paymentId.slice(0, 12)}`,
      razorpayPaymentId: `pay_dev_${paymentId.slice(0, 12)}`,
      receiptNumber,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    await db
      .update(bills)
      .set({ status: "paid", updatedBy: claims.sub })
      .where(eq(bills.id, bill.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "payment.recorded",
      entityType: "bill",
      entityId: bill.id,
      meta: { paymentId, amountPaise: bill.amountPaise, method: "razorpay" },
    });

    await notifyUser({
      tenantId: claims.tenantId,
      userId: claims.sub,
      title: "Payment received",
      body: `Receipt ${receiptNumber} for ₹${(bill.amountPaise / 100).toFixed(2)}`,
      kind: "payment",
      linkPath: `/payments`,
    });

    const [row] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    return toPaymentDto(row!, flatNumber) satisfies PaymentDto;
  })
  .delete("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const { bill } = await loadBillWithFlat(params.id, claims.tenantId);
    const parsedBody = (body as { corrected?: boolean } | null) ?? {};
    const nextStatus = parsedBody.corrected ? "corrected" : "void";

    await db
      .update(bills)
      .set({ status: nextStatus, updatedBy: claims.sub })
      .where(eq(bills.id, bill.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: `bill.${nextStatus}`,
      entityType: "bill",
      entityId: bill.id,
    });

    return { ok: true as const, status: nextStatus };
  });
