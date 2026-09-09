import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Elysia } from "elysia";
import { and, count, desc, eq } from "drizzle-orm";
import type { PaymentAccountDto, PaymentDto } from "@society-hub/types";
import {
  listQuerySchema,
  recordPaymentSchema,
  reviewPaymentSchema,
  updatePaymentAccountSchema,
} from "@society-hub/validation";
import { env } from "../../config";
import { db } from "../../db/client";
import { bills, flats, payments, societies } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import {
  authPlugin,
  isStaffRole,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";

export function generateReceiptNumber() {
  return `RCPT-${Date.now().toString(36).toUpperCase()}`;
}

export function toPaymentDto(
  row: typeof payments.$inferSelect,
  flatNumber: string | null,
): PaymentDto {
  return {
    id: row.id,
    billId: row.billId,
    flatId: row.flatId,
    flatNumber,
    amountPaise: row.amountPaise,
    method: row.method,
    status: row.status,
    receiptNumber: row.receiptNumber,
    proofUrl: row.proofBlobPath
      ? `${env.publicApiUrl}/v1/payments/${row.id}/proof`
      : null,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
  };
}

function toPaymentAccountDto(
  society: typeof societies.$inferSelect,
): PaymentAccountDto {
  return {
    upiId: society.upiId ?? null,
    accountName: society.accountName ?? null,
    accountNumber: society.accountNumber ?? null,
    ifsc: society.ifsc ?? null,
    qrUrl: society.qrBlobPath
      ? `${env.publicApiUrl}/v1/payments/account/qr`
      : null,
  };
}

async function claimsFromAuthOrQuery(
  auth: Parameters<typeof requireAuth>[0],
  query: Record<string, unknown>,
) {
  let claims = auth;
  if (!claims && typeof query.access_token === "string") {
    try {
      const { verifyAccessToken } = await import("@society-hub/auth");
      claims = await verifyAccessToken(query.access_token, env.jwtSecret);
    } catch {
      claims = null;
    }
  }
  return requireAuth(claims);
}

async function saveTenantImage(
  tenantId: string,
  folder: string,
  file: File,
) {
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new AppError(400, "invalid_type", "Only images are allowed");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new AppError(400, "file_too_large", "Image exceeds 10MB");
  }
  await mkdir(env.uploadDir, { recursive: true });
  const id = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const rel = `${tenantId}/${folder}/${id}.${ext}`;
  await mkdir(join(env.uploadDir, tenantId, folder), { recursive: true });
  await Bun.write(join(env.uploadDir, rel), file);
  return { rel, contentType };
}

async function loadSociety(tenantId: string) {
  const [society] = await db
    .select()
    .from(societies)
    .where(and(eq(societies.id, tenantId), eq(societies.isDeleted, false)))
    .limit(1);
  if (!society) throw new AppError(404, "not_found", "Society not found");
  return society;
}

export const paymentRoutes = new Elysia({ prefix: "/v1/payments" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const q = listQuerySchema.parse(query);
    const offset = (q.page - 1) * q.limit;
    const where = and(eq(payments.tenantId, claims.tenantId), eq(payments.isDeleted, false));

    const [{ total } = { total: 0 }] = await db
      .select({ total: count() })
      .from(payments)
      .where(where);

    const rows = await db
      .select({ payment: payments, flatNumber: flats.number })
      .from(payments)
      .leftJoin(flats, eq(flats.id, payments.flatId))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(q.limit)
      .offset(offset);

    return {
      items: rows.map((r) => toPaymentDto(r.payment, r.flatNumber)),
      page: q.page,
      limit: q.limit,
      total: Number(total),
    };
  })
  .get("/mine", async ({ auth }) => {
    const claims = requireAuth(auth);
    if (!claims.flatId) return [] as PaymentDto[];
    const rows = await db
      .select({ payment: payments, flatNumber: flats.number })
      .from(payments)
      .leftJoin(flats, eq(flats.id, payments.flatId))
      .where(
        and(
          eq(payments.tenantId, claims.tenantId),
          eq(payments.flatId, claims.flatId),
          eq(payments.isDeleted, false),
        ),
      )
      .orderBy(desc(payments.createdAt));
    return rows.map((r) => toPaymentDto(r.payment, r.flatNumber));
  })
  .get("/account", async ({ auth }) => {
    const claims = requireAuth(auth);
    return toPaymentAccountDto(await loadSociety(claims.tenantId));
  })
  .patch("/account", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updatePaymentAccountSchema.parse(body);
    await loadSociety(claims.tenantId);
    await db
      .update(societies)
      .set({
        ...(parsed.upiId !== undefined ? { upiId: parsed.upiId || null } : {}),
        ...(parsed.accountName !== undefined
          ? { accountName: parsed.accountName || null }
          : {}),
        ...(parsed.accountNumber !== undefined
          ? { accountNumber: parsed.accountNumber || null }
          : {}),
        ...(parsed.ifsc !== undefined ? { ifsc: parsed.ifsc || null } : {}),
        updatedBy: claims.sub,
      })
      .where(eq(societies.id, claims.tenantId));
    return toPaymentAccountDto(await loadSociety(claims.tenantId));
  })
  .post("/account/qr", async ({ auth, request }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await loadSociety(claims.tenantId);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError(400, "file_required", "file is required");
    }
    const saved = await saveTenantImage(claims.tenantId, "payment-qr", file);
    await db
      .update(societies)
      .set({
        qrBlobPath: saved.rel,
        qrContentType: saved.contentType,
        updatedBy: claims.sub,
      })
      .where(eq(societies.id, claims.tenantId));
    return toPaymentAccountDto(await loadSociety(claims.tenantId));
  })
  .get("/account/qr", async ({ auth, query }) => {
    const claims = await claimsFromAuthOrQuery(auth, query);
    const society = await loadSociety(claims.tenantId);
    if (!society.qrBlobPath) throw new AppError(404, "not_found", "No QR uploaded");
    const file = Bun.file(join(env.uploadDir, society.qrBlobPath));
    if (!(await file.exists())) throw new AppError(404, "not_found", "File missing");
    return new Response(file, {
      headers: { "Content-Type": society.qrContentType ?? "image/png" },
    });
  })
  .post("/offline", async ({ auth, request }) => {
    const claims = requireAuth(auth);
    const form = await request.formData();
    const billIdRaw = form.get("billId");
    const billId = typeof billIdRaw === "string" ? billIdRaw : "";
    const file = form.get("file");
    if (!billId) throw new AppError(400, "bill_required", "billId is required");
    if (!(file instanceof File)) {
      throw new AppError(400, "file_required", "Payment screenshot is required");
    }

    const [bill] = await db
      .select()
      .from(bills)
      .where(
        and(
          eq(bills.id, billId),
          eq(bills.tenantId, claims.tenantId),
          eq(bills.isDeleted, false),
        ),
      )
      .limit(1);
    if (!bill) throw new AppError(404, "not_found", "Bill not found");
    if (!isStaffRole(claims.role) && bill.flatId !== claims.flatId) {
      throw new AppError(404, "not_found", "Bill not found");
    }
    if (bill.status === "paid") {
      throw new AppError(400, "already_paid", "Bill is already paid");
    }

    const [pending] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.billId, bill.id),
          eq(payments.status, "pending"),
          eq(payments.isDeleted, false),
        ),
      )
      .limit(1);
    if (pending) {
      throw new AppError(
        400,
        "already_pending",
        "A payment screenshot is already waiting for admin review",
      );
    }

    const saved = await saveTenantImage(claims.tenantId, `payment-proof/${bill.id}`, file);
    const id = crypto.randomUUID();
    await db.insert(payments).values({
      id,
      tenantId: claims.tenantId,
      billId: bill.id,
      flatId: bill.flatId,
      amountPaise: bill.amountPaise,
      method: "upi",
      status: "pending",
      proofBlobPath: saved.rel,
      proofContentType: saved.contentType,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "payment.proof_submitted",
      entityType: "payment",
      entityId: id,
      meta: { billId: bill.id, method: "upi" },
    });

    const [flat] = await db.select().from(flats).where(eq(flats.id, bill.flatId)).limit(1);
    const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return toPaymentDto(row!, flat?.number ?? null);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = recordPaymentSchema.parse(body);

    const [flat] = await db
      .select()
      .from(flats)
      .where(
        and(
          eq(flats.id, parsed.flatId),
          eq(flats.tenantId, claims.tenantId),
          eq(flats.isDeleted, false),
        ),
      )
      .limit(1);
    if (!flat) throw new AppError(404, "flat_not_found", "Flat not found");

    if (parsed.billId) {
      const [bill] = await db
        .select()
        .from(bills)
        .where(
          and(
            eq(bills.id, parsed.billId),
            eq(bills.tenantId, claims.tenantId),
            eq(bills.isDeleted, false),
          ),
        )
        .limit(1);
      if (!bill) throw new AppError(404, "bill_not_found", "Bill not found");
    }

    // Manual/offline settlement (cash, cheque, NEFT); Razorpay flows go
    // through /v1/bills/:id/pay or the webhook below.
    const id = crypto.randomUUID();
    const receiptNumber = parsed.receiptNumber ?? generateReceiptNumber();
    await db.insert(payments).values({
      id,
      tenantId: claims.tenantId,
      billId: parsed.billId ?? null,
      flatId: parsed.flatId,
      amountPaise: parsed.amountPaise,
      method: parsed.method,
      status: "success",
      receiptNumber,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    if (parsed.billId) {
      await db
        .update(bills)
        .set({ status: "paid", updatedBy: claims.sub })
        .where(eq(bills.id, parsed.billId));
    }

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "payment.recorded",
      entityType: "payment",
      entityId: id,
      meta: { method: parsed.method, amountPaise: parsed.amountPaise },
    });

    const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return toPaymentDto(row!, flat.number);
  })
  .post("/mock", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    const payload = body as { billId?: string };
    if (!payload?.billId) {
      throw new AppError(400, "bill_required", "billId is required");
    }
    const [bill] = await db
      .select()
      .from(bills)
      .where(
        and(
          eq(bills.id, payload.billId),
          eq(bills.tenantId, claims.tenantId),
          eq(bills.isDeleted, false),
        ),
      )
      .limit(1);
    if (!bill) throw new AppError(404, "not_found", "Bill not found");
    if (!isStaffRole(claims.role) && bill.flatId !== claims.flatId) {
      throw new AppError(404, "not_found", "Bill not found");
    }
    if (bill.status === "paid") {
      throw new AppError(400, "already_paid", "Bill is already paid");
    }

    const [flat] = await db.select().from(flats).where(eq(flats.id, bill.flatId)).limit(1);

    // Mock Razorpay order + instant settlement for local/dev testing; a real
    // integration creates an order here and confirms via the signed webhook.
    const id = crypto.randomUUID();
    const receiptNumber = generateReceiptNumber();
    await db.insert(payments).values({
      id,
      tenantId: claims.tenantId,
      billId: bill.id,
      flatId: bill.flatId,
      amountPaise: bill.amountPaise,
      method: "razorpay",
      status: "success",
      razorpayOrderId: `order_dev_${id.slice(0, 12)}`,
      razorpayPaymentId: `pay_dev_${id.slice(0, 12)}`,
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
      meta: { paymentId: id, amountPaise: bill.amountPaise, method: "razorpay" },
    });

    const [row] = await db.select().from(payments).where(eq(payments.id, id)).limit(1);
    return toPaymentDto(row!, flat?.number ?? null);
  })
  .post("/:id/acknowledge", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = reviewPaymentSchema.parse(body ?? {});
    const [row] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, params.id),
          eq(payments.tenantId, claims.tenantId),
          eq(payments.isDeleted, false),
        ),
      )
      .limit(1);
    if (!row) throw new AppError(404, "not_found", "Payment not found");
    if (row.status !== "pending") {
      throw new AppError(400, "not_pending", "Only pending payments can be acknowledged");
    }

    const receiptNumber = row.receiptNumber ?? generateReceiptNumber();
    await db
      .update(payments)
      .set({
        status: "success",
        receiptNumber,
        reviewNote: parsed.note ?? null,
        updatedBy: claims.sub,
      })
      .where(eq(payments.id, row.id));

    if (row.billId) {
      await db
        .update(bills)
        .set({ status: "paid", updatedBy: claims.sub })
        .where(eq(bills.id, row.billId));
    }

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "payment.acknowledged",
      entityType: "payment",
      entityId: row.id,
      meta: { billId: row.billId, amountPaise: row.amountPaise },
    });

    if (row.createdBy) {
      await notifyUser({
        tenantId: claims.tenantId,
        userId: row.createdBy,
        title: "Payment credited",
        body: `Receipt ${receiptNumber} for ₹${(row.amountPaise / 100).toFixed(2)}`,
        kind: "payment",
        linkPath: "/payments",
      });
    }

    const [flat] = await db.select().from(flats).where(eq(flats.id, row.flatId)).limit(1);
    const [updated] = await db.select().from(payments).where(eq(payments.id, row.id)).limit(1);
    return toPaymentDto(updated!, flat?.number ?? null);
  })
  .post("/:id/reject", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = reviewPaymentSchema.parse(body ?? {});
    const [row] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, params.id),
          eq(payments.tenantId, claims.tenantId),
          eq(payments.isDeleted, false),
        ),
      )
      .limit(1);
    if (!row) throw new AppError(404, "not_found", "Payment not found");
    if (row.status !== "pending") {
      throw new AppError(400, "not_pending", "Only pending payments can be rejected");
    }

    await db
      .update(payments)
      .set({
        status: "failed",
        reviewNote: parsed.note ?? null,
        updatedBy: claims.sub,
      })
      .where(eq(payments.id, row.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "payment.rejected",
      entityType: "payment",
      entityId: row.id,
      meta: { billId: row.billId },
    });

    if (row.createdBy) {
      await notifyUser({
        tenantId: claims.tenantId,
        userId: row.createdBy,
        title: "Payment not accepted",
        body: parsed.note || "Your payment screenshot was not accepted. Please submit again.",
        kind: "payment",
        linkPath: "/bills",
      });
    }

    const [flat] = await db.select().from(flats).where(eq(flats.id, row.flatId)).limit(1);
    const [updated] = await db.select().from(payments).where(eq(payments.id, row.id)).limit(1);
    return toPaymentDto(updated!, flat?.number ?? null);
  })
  .get("/:id/proof", async ({ auth, params, query }) => {
    const claims = await claimsFromAuthOrQuery(auth, query);
    const [row] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.id, params.id),
          eq(payments.tenantId, claims.tenantId),
          eq(payments.isDeleted, false),
        ),
      )
      .limit(1);
    if (!row?.proofBlobPath) throw new AppError(404, "not_found", "Proof not found");
    if (!isStaffRole(claims.role) && row.flatId !== claims.flatId) {
      throw new AppError(404, "not_found", "Proof not found");
    }
    const file = Bun.file(join(env.uploadDir, row.proofBlobPath));
    if (!(await file.exists())) throw new AppError(404, "not_found", "File missing");
    return new Response(file, {
      headers: { "Content-Type": row.proofContentType ?? "image/jpeg" },
    });
  })
  .get("/:id/receipt", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [row] = await db
      .select({ payment: payments, flatNumber: flats.number })
      .from(payments)
      .leftJoin(flats, eq(flats.id, payments.flatId))
      .where(
        and(
          eq(payments.id, params.id),
          eq(payments.tenantId, claims.tenantId),
          eq(payments.isDeleted, false),
        ),
      )
      .limit(1);
    if (!row) throw new AppError(404, "not_found", "Payment not found");
    if (!isStaffRole(claims.role) && row.payment.flatId !== claims.flatId) {
      throw new AppError(404, "not_found", "Payment not found");
    }
    return {
      receiptNumber: row.payment.receiptNumber ?? row.payment.id,
      paymentId: row.payment.id,
      flatNumber: row.flatNumber ?? "",
      amountPaise: row.payment.amountPaise,
      method: row.payment.method,
      paidAt: row.payment.createdAt,
    };
  })
  .post("/razorpay/webhook", async ({ body }) => {
    // Dev/staging webhook: production must verify the Razorpay signature
    // header before trusting this payload (see societyhub-razorpay-payments
    // skill). This mock accepts { orderId, paymentId, status }.
    const payload = body as {
      orderId?: string;
      paymentId?: string;
      status?: "success" | "failed";
    };
    if (!payload?.orderId) {
      throw new AppError(400, "invalid_webhook", "orderId is required");
    }
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.razorpayOrderId, payload.orderId))
      .limit(1);
    if (!row) throw new AppError(404, "not_found", "Payment order not found");

    const status = payload.status ?? "success";
    await db
      .update(payments)
      .set({
        status,
        razorpayPaymentId: payload.paymentId ?? row.razorpayPaymentId,
      })
      .where(eq(payments.id, row.id));

    if (status === "success" && row.billId) {
      await db.update(bills).set({ status: "paid" }).where(eq(bills.id, row.billId));
    }

    await recordAudit({
      tenantId: row.tenantId,
      actorUserId: row.createdBy ?? "system",
      action: "payment.webhook",
      entityType: "payment",
      entityId: row.id,
      meta: { status },
    });

    return { ok: true as const };
  });
