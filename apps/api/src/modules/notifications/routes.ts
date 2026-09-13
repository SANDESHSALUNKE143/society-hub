import { Elysia } from "elysia";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { NotificationDto, Paginated } from "@society-hub/types";
import { listQuerySchema } from "@society-hub/validation";
import { db } from "../../db/client";
import { notifications } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { authPlugin, requireAuth } from "../../lib/auth-context";

function nowMysql() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function toDto(row: typeof notifications.$inferSelect): NotificationDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    readAt: row.readAt,
    linkPath: row.linkPath,
    createdAt: row.createdAt,
  };
}

export const notificationRoutes = new Elysia({ prefix: "/v1/notifications" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const parsed = listQuerySchema.parse(query);
    const where = and(
      eq(notifications.tenantId, claims.tenantId),
      eq(notifications.userId, claims.sub),
      eq(notifications.isDeleted, false),
    );
    const [totalRow] = await db
      .select({ total: count() })
      .from(notifications)
      .where(where);
    const rows = await db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(parsed.limit)
      .offset((parsed.page - 1) * parsed.limit);
    const result: Paginated<NotificationDto> = {
      items: rows.map(toDto),
      page: parsed.page,
      limit: parsed.limit,
      total: Number(totalRow?.total ?? 0),
    };
    return result;
  })
  .get("/unread-count", async ({ auth }) => {
    const claims = requireAuth(auth);
    const [unreadRow] = await db
      .select({ total: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, claims.tenantId),
          eq(notifications.userId, claims.sub),
          eq(notifications.isDeleted, false),
          isNull(notifications.readAt),
        ),
      );
    return { unread: Number(unreadRow?.total ?? 0) };
  })
  .post("/read-all", async ({ auth }) => {
    const claims = requireAuth(auth);
    await db
      .update(notifications)
      .set({ readAt: nowMysql(), updatedBy: claims.sub })
      .where(
        and(
          eq(notifications.tenantId, claims.tenantId),
          eq(notifications.userId, claims.sub),
          eq(notifications.isDeleted, false),
          isNull(notifications.readAt),
        ),
      );
    return { ok: true as const };
  })
  .post("/:id/read", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [existing] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, params.id),
          eq(notifications.userId, claims.sub),
          eq(notifications.tenantId, claims.tenantId),
          eq(notifications.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Notification not found");

    if (!existing.readAt) {
      await db
        .update(notifications)
        .set({ readAt: nowMysql() })
        .where(eq(notifications.id, params.id));
    }
    const [row] = await db.select().from(notifications).where(eq(notifications.id, params.id)).limit(1);
    return toDto(row!);
  });
