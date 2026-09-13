import { Elysia } from "elysia";
import { and, desc, eq, inArray } from "drizzle-orm";
import type {
  IntegrationHealthDto,
  PlatformAnnouncementDto,
  PlatformBillDto,
  PlatformDiscountDto,
  PlatformPlanDto,
  PlatformSubscriptionDto,
  SupportTicketDto,
} from "@society-hub/types";
import {
  assignSubscriptionSchema,
  createAnnouncementSchema,
  createDiscountSchema,
  createSupportTicketSchema,
  generatePlatformBillSchema,
  replySupportTicketSchema,
  updateSocietySettingsSchema,
} from "@society-hub/validation";
import { env } from "../../config";
import { db } from "../../db/client";
import {
  platformAnnouncements,
  platformBills,
  platformDiscounts,
  platformPayments,
  platformPlans,
  platformSubscriptions,
  societies,
  supportTickets,
  userRoles,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import {
  authPlugin,
  requireAuth,
  requirePlatform,
  requireSocietyStaff,
} from "../../lib/auth-context";

const DEFAULT_MODULES = [
  "complaints",
  "bills",
  "payments",
  "notices",
  "visitors",
  "parking",
  "bookings",
  "assets",
  "vendors",
  "events",
];

function nowMysql() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function toPlanDto(row: typeof platformPlans.$inferSelect): PlatformPlanDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    monthlyFeePaise: row.monthlyFeePaise,
    modulesJson: row.modulesJson,
    flatHint: row.flatHint,
  };
}

async function ensureDefaultPlans() {
  const existing = await db.select().from(platformPlans).where(eq(platformPlans.isDeleted, false));
  if (existing.length) return existing;
  const seeds = [
    { code: "starter", name: "Starter", monthlyFeePaise: 499900, flatHint: 50 },
    { code: "growth", name: "Growth", monthlyFeePaise: 999900, flatHint: 200 },
    { code: "enterprise", name: "Enterprise", monthlyFeePaise: 2499900, flatHint: 1000 },
  ];
  for (const s of seeds) {
    await db.insert(platformPlans).values({
      id: crypto.randomUUID(),
      code: s.code,
      name: s.name,
      monthlyFeePaise: s.monthlyFeePaise,
      modulesJson: JSON.stringify(DEFAULT_MODULES),
      flatHint: s.flatHint,
    });
  }
  return db.select().from(platformPlans).where(eq(platformPlans.isDeleted, false));
}

export const manageCommercialRoutes = new Elysia({ prefix: "/v1/manage" })
  .use(authPlugin)
  .get("/plans", async ({ auth }) => {
    requirePlatform(requireAuth(auth));
    const plans = await ensureDefaultPlans();
    return plans.map(toPlanDto);
  })
  .get("/subscriptions", async ({ auth }) => {
    requirePlatform(requireAuth(auth));
    const rows = await db
      .select({
        sub: platformSubscriptions,
        planName: platformPlans.name,
      })
      .from(platformSubscriptions)
      .leftJoin(platformPlans, eq(platformPlans.id, platformSubscriptions.planId))
      .where(eq(platformSubscriptions.isDeleted, false))
      .orderBy(desc(platformSubscriptions.createdAt));
    return rows.map(
      (r): PlatformSubscriptionDto => ({
        id: r.sub.id,
        tenantId: r.sub.tenantId,
        planId: r.sub.planId,
        planName: r.planName ?? undefined,
        cycle: r.sub.cycle,
        status: r.sub.status,
        startsAt: r.sub.startsAt,
        endsAt: r.sub.endsAt,
      }),
    );
  })
  .post("/subscriptions", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = assignSubscriptionSchema.parse(body);
    await ensureDefaultPlans();
    const [plan] = await db
      .select()
      .from(platformPlans)
      .where(and(eq(platformPlans.id, parsed.planId), eq(platformPlans.isDeleted, false)))
      .limit(1);
    if (!plan) throw new AppError(404, "not_found", "Plan not found");
    const [society] = await db
      .select()
      .from(societies)
      .where(and(eq(societies.id, parsed.tenantId), eq(societies.isDeleted, false)))
      .limit(1);
    if (!society) throw new AppError(404, "not_found", "Society not found");

    await db
      .update(platformSubscriptions)
      .set({ status: "cancelled", updatedBy: claims.sub })
      .where(
        and(
          eq(platformSubscriptions.tenantId, parsed.tenantId),
          eq(platformSubscriptions.status, "active"),
          eq(platformSubscriptions.isDeleted, false),
        ),
      );

    const id = crypto.randomUUID();
    await db.insert(platformSubscriptions).values({
      id,
      tenantId: parsed.tenantId,
      planId: parsed.planId,
      cycle: parsed.cycle,
      status: "active",
      startsAt: nowMysql(),
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    await db
      .update(societies)
      .set({
        planId: parsed.planId,
        featureFlagsJson: plan.modulesJson,
        updatedBy: claims.sub,
      })
      .where(eq(societies.id, parsed.tenantId));
    await recordAudit({
      tenantId: parsed.tenantId,
      actorUserId: claims.sub,
      action: "subscription.assigned",
      entityType: "platform_subscription",
      entityId: id,
      meta: { planId: parsed.planId },
    });
    return {
      id,
      tenantId: parsed.tenantId,
      planId: parsed.planId,
      planName: plan.name,
      cycle: parsed.cycle,
      status: "active" as const,
      startsAt: nowMysql(),
      endsAt: null,
    } satisfies PlatformSubscriptionDto;
  })
  .get("/discounts", async ({ auth }) => {
    requirePlatform(requireAuth(auth));
    const rows = await db
      .select()
      .from(platformDiscounts)
      .where(eq(platformDiscounts.isDeleted, false))
      .orderBy(desc(platformDiscounts.createdAt));
    return rows.map(
      (r): PlatformDiscountDto => ({
        id: r.id,
        tenantId: r.tenantId,
        subscriptionId: r.subscriptionId,
        code: r.code,
        percentOff: r.percentOff,
        flatOffPaise: r.flatOffPaise,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
      }),
    );
  })
  .post("/discounts", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createDiscountSchema.parse(body);
    if (parsed.percentOff == null && parsed.flatOffPaise == null) {
      throw new AppError(400, "discount_required", "percentOff or flatOffPaise is required");
    }
    const id = crypto.randomUUID();
    await db.insert(platformDiscounts).values({
      id,
      tenantId: parsed.tenantId ?? null,
      subscriptionId: parsed.subscriptionId ?? null,
      code: parsed.code ?? null,
      percentOff: parsed.percentOff ?? null,
      flatOffPaise: parsed.flatOffPaise ?? null,
      startsAt: parsed.startsAt ?? null,
      endsAt: parsed.endsAt ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(platformDiscounts).where(eq(platformDiscounts.id, id)).limit(1);
    return {
      id: row!.id,
      tenantId: row!.tenantId,
      subscriptionId: row!.subscriptionId,
      code: row!.code,
      percentOff: row!.percentOff,
      flatOffPaise: row!.flatOffPaise,
      startsAt: row!.startsAt,
      endsAt: row!.endsAt,
    } satisfies PlatformDiscountDto;
  })
  .get("/platform-bills", async ({ auth }) => {
    requirePlatform(requireAuth(auth));
    const rows = await db
      .select({ bill: platformBills, societyName: societies.name })
      .from(platformBills)
      .leftJoin(societies, eq(societies.id, platformBills.tenantId))
      .where(eq(platformBills.isDeleted, false))
      .orderBy(desc(platformBills.createdAt));
    return rows.map(
      (r): PlatformBillDto => ({
        id: r.bill.id,
        tenantId: r.bill.tenantId,
        societyName: r.societyName ?? undefined,
        periodYm: r.bill.periodYm,
        amountPaise: r.bill.amountPaise,
        status: r.bill.status,
        notes: r.bill.notes,
        createdAt: r.bill.createdAt,
      }),
    );
  })
  .post("/platform-bills/generate", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = generatePlatformBillSchema.parse(body);
    const [sub] = await db
      .select({
        sub: platformSubscriptions,
        plan: platformPlans,
      })
      .from(platformSubscriptions)
      .leftJoin(platformPlans, eq(platformPlans.id, platformSubscriptions.planId))
      .where(
        and(
          eq(platformSubscriptions.tenantId, parsed.tenantId),
          eq(platformSubscriptions.status, "active"),
          eq(platformSubscriptions.isDeleted, false),
        ),
      )
      .limit(1);
    const amount =
      parsed.amountPaise ??
      sub?.plan?.monthlyFeePaise ??
      0;
    if (!amount) throw new AppError(400, "amount_required", "amountPaise or active plan required");
    const id = crypto.randomUUID();
    await db.insert(platformBills).values({
      id,
      tenantId: parsed.tenantId,
      subscriptionId: sub?.sub.id ?? null,
      periodYm: parsed.periodYm,
      amountPaise: amount,
      status: "issued",
      notes: parsed.notes ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [society] = await db.select().from(societies).where(eq(societies.id, parsed.tenantId)).limit(1);
    return {
      id,
      tenantId: parsed.tenantId,
      societyName: society?.name,
      periodYm: parsed.periodYm,
      amountPaise: amount,
      status: "issued" as const,
      notes: parsed.notes ?? null,
      createdAt: nowMysql(),
    } satisfies PlatformBillDto;
  })
  .post("/platform-bills/:id/mark-paid", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const [bill] = await db
      .select()
      .from(platformBills)
      .where(and(eq(platformBills.id, params.id), eq(platformBills.isDeleted, false)))
      .limit(1);
    if (!bill) throw new AppError(404, "not_found", "Platform bill not found");
    await db
      .update(platformBills)
      .set({ status: "paid", updatedBy: claims.sub })
      .where(eq(platformBills.id, params.id));
    await db.insert(platformPayments).values({
      id: crypto.randomUUID(),
      tenantId: bill.tenantId,
      billId: bill.id,
      amountPaise: bill.amountPaise,
      method: "offline",
      status: "success",
      receiptNumber: `PF-${Date.now().toString(36).toUpperCase()}`,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    return { ok: true as const };
  })
  .get("/announcements", async ({ auth }) => {
    requirePlatform(requireAuth(auth));
    const rows = await db
      .select()
      .from(platformAnnouncements)
      .where(eq(platformAnnouncements.isDeleted, false))
      .orderBy(desc(platformAnnouncements.createdAt));
    return rows.map(
      (r): PlatformAnnouncementDto => ({
        id: r.id,
        title: r.title,
        body: r.body,
        audience: r.audience,
        publishedAt: r.publishedAt,
        createdAt: r.createdAt,
      }),
    );
  })
  .post("/announcements", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = createAnnouncementSchema.parse(body);
    const id = crypto.randomUUID();
    const publishedAt = parsed.publishNow === false ? null : nowMysql();
    await db.insert(platformAnnouncements).values({
      id,
      title: parsed.title,
      body: parsed.body,
      audience: parsed.audience,
      tenantIdsJson: parsed.tenantIds ? JSON.stringify(parsed.tenantIds) : null,
      publishedAt,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    if (publishedAt) {
      let tenantIds = parsed.tenantIds ?? [];
      if (parsed.audience === "all") {
        const all = await db.select({ id: societies.id }).from(societies).where(eq(societies.isDeleted, false));
        tenantIds = all.map((s) => s.id);
      }
      for (const tenantId of tenantIds) {
        const staff = await db
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .where(
            and(
              eq(userRoles.tenantId, tenantId),
              eq(userRoles.isDeleted, false),
              inArray(userRoles.role, [
                "chairperson",
                "admin",
                "secretary",
                "treasurer",
                "cashier",
                "committee",
              ]),
            ),
          );
        for (const s of staff) {
          await notifyUser({
            tenantId,
            userId: s.userId,
            title: parsed.title,
            body: parsed.body,
            kind: "platform_announcement",
            linkPath: "/notifications",
          });
        }
      }
    }
    return {
      id,
      title: parsed.title,
      body: parsed.body,
      audience: parsed.audience,
      publishedAt,
      createdAt: nowMysql(),
    } satisfies PlatformAnnouncementDto;
  })
  .get("/support-tickets", async ({ auth }) => {
    requirePlatform(requireAuth(auth));
    const rows = await db
      .select({ ticket: supportTickets, societyName: societies.name })
      .from(supportTickets)
      .leftJoin(societies, eq(societies.id, supportTickets.tenantId))
      .where(eq(supportTickets.isDeleted, false))
      .orderBy(desc(supportTickets.createdAt));
    return rows.map(
      (r): SupportTicketDto => ({
        id: r.ticket.id,
        tenantId: r.ticket.tenantId,
        societyName: r.societyName ?? undefined,
        subject: r.ticket.subject,
        body: r.ticket.body,
        status: r.ticket.status,
        reply: r.ticket.reply,
        openedByUserId: r.ticket.openedByUserId,
        createdAt: r.ticket.createdAt,
      }),
    );
  })
  .post("/support-tickets/:id/reply", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = replySupportTicketSchema.parse(body);
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, params.id), eq(supportTickets.isDeleted, false)))
      .limit(1);
    if (!ticket) throw new AppError(404, "not_found", "Ticket not found");
    await db
      .update(supportTickets)
      .set({
        reply: parsed.reply,
        status: parsed.close === false ? ticket.status : "closed",
        closedAt: parsed.close === false ? ticket.closedAt : nowMysql(),
        updatedBy: claims.sub,
      })
      .where(eq(supportTickets.id, params.id));
    await notifyUser({
      tenantId: ticket.tenantId,
      userId: ticket.openedByUserId,
      title: "Support reply",
      body: parsed.reply.slice(0, 200),
      kind: "support",
      linkPath: "/account",
    });
    return { ok: true as const };
  })
  .get("/integrations/health", async ({ auth }) => {
    requirePlatform(requireAuth(auth));
    const health: IntegrationHealthDto = {
      otpConfigured: Boolean(process.env.MSG91_AUTH_KEY),
      emailConfigured: Boolean(process.env.RESEND_API_KEY),
      storageLocal: !process.env.AZURE_STORAGE_CONNECTION_STRING,
      razorpayWebhookConfigured: Boolean(env.razorpayWebhookSecret),
      googleSsoConfigured: Boolean(env.googleClientId),
    };
    return health;
  })
  .patch("/societies/:id/settings", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requirePlatform(claims);
    const parsed = updateSocietySettingsSchema.parse(body);
    const [society] = await db
      .select()
      .from(societies)
      .where(and(eq(societies.id, params.id), eq(societies.isDeleted, false)))
      .limit(1);
    if (!society) throw new AppError(404, "not_found", "Society not found");
    await db
      .update(societies)
      .set({
        ...(parsed.slaDays != null ? { slaDays: parsed.slaDays } : {}),
        ...(parsed.billingDefaults !== undefined
          ? { billingDefaults: parsed.billingDefaults }
          : {}),
        ...(parsed.status != null ? { status: parsed.status } : {}),
        ...(parsed.featureFlagsJson !== undefined
          ? { featureFlagsJson: parsed.featureFlagsJson }
          : {}),
        ...(parsed.planId !== undefined ? { planId: parsed.planId } : {}),
        updatedBy: claims.sub,
      })
      .where(eq(societies.id, params.id));
    await recordAudit({
      tenantId: params.id,
      actorUserId: claims.sub,
      action: "society.settings_updated",
      entityType: "society",
      entityId: params.id,
      meta: parsed,
    });
    return { ok: true as const };
  });

export const supportRoutes = new Elysia({ prefix: "/v1/support" })
  .use(authPlugin)
  .get("/tickets", async ({ auth }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const rows = await db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.tenantId, claims.tenantId),
          eq(supportTickets.isDeleted, false),
        ),
      )
      .orderBy(desc(supportTickets.createdAt));
    return rows.map(
      (r): SupportTicketDto => ({
        id: r.id,
        tenantId: r.tenantId,
        subject: r.subject,
        body: r.body,
        status: r.status,
        reply: r.reply,
        openedByUserId: r.openedByUserId,
        createdAt: r.createdAt,
      }),
    );
  })
  .post("/tickets", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createSupportTicketSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(supportTickets).values({
      id,
      tenantId: claims.tenantId,
      openedByUserId: claims.sub,
      subject: parsed.subject,
      body: parsed.body,
      status: "open",
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    return {
      id,
      tenantId: claims.tenantId,
      subject: parsed.subject,
      body: parsed.body,
      status: "open" as const,
      reply: null,
      openedByUserId: claims.sub,
      createdAt: nowMysql(),
    } satisfies SupportTicketDto;
  });

/** Current society's feature flags for Client App nav. */
export const societyFlagsRoutes = new Elysia({ prefix: "/v1/society" })
  .use(authPlugin)
  .get("/settings", async ({ auth }) => {
    const claims = requireAuth(auth);
    const [society] = await db
      .select()
      .from(societies)
      .where(and(eq(societies.id, claims.tenantId), eq(societies.isDeleted, false)))
      .limit(1);
    if (!society) throw new AppError(404, "not_found", "Society not found");
    return {
      id: society.id,
      name: society.name,
      slaDays: society.slaDays,
      billingDefaults: society.billingDefaults,
      status: society.status,
      featureFlagsJson: society.featureFlagsJson,
      planId: society.planId,
    };
  })
  .patch("/settings", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateSocietySettingsSchema
      .omit({ status: true, featureFlagsJson: true, planId: true })
      .parse(body);
    await db
      .update(societies)
      .set({
        ...(parsed.slaDays != null ? { slaDays: parsed.slaDays } : {}),
        ...(parsed.billingDefaults !== undefined
          ? { billingDefaults: parsed.billingDefaults }
          : {}),
        updatedBy: claims.sub,
      })
      .where(eq(societies.id, claims.tenantId));
    return { ok: true as const };
  });
