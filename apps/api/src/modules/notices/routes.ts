import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Elysia } from "elysia";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NoticeAttachmentDto, NoticeDto, Paginated } from "@society-hub/types";
import {
  createNoticeSchema,
  noticeListQuerySchema,
  updateNoticeSchema,
} from "@society-hub/validation";
import { env } from "../../config";
import { db } from "../../db/client";
import { flats, noticeAttachments, noticeReads, notices } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { softDelete } from "../../lib/soft-delete";
import { toApiIsoDateTime } from "../../lib/api-datetime";
import {
  authPlugin,
  isStaffRole,
  requireAuth,
  requireSocietyStaff,
} from "../../lib/auth-context";

function nowMysql() {
  return new Date().toISOString().replace("T", " ").replace("Z", "");
}

function attachmentDto(row: typeof noticeAttachments.$inferSelect): NoticeAttachmentDto {
  return {
    id: row.id,
    contentKind: row.contentKind,
    contentType: row.contentType,
    url: `${env.publicApiUrl}/v1/notice-media/${row.id}`,
    byteSize: row.byteSize,
  };
}

async function loadAttachments(noticeIds: string[], tenantId: string) {
  if (noticeIds.length === 0) return new Map<string, NoticeAttachmentDto[]>();
  const rows = await db
    .select()
    .from(noticeAttachments)
    .where(
      and(
        eq(noticeAttachments.tenantId, tenantId),
        inArray(noticeAttachments.noticeId, noticeIds),
        eq(noticeAttachments.isDeleted, false),
      ),
    )
    .orderBy(noticeAttachments.createdAt);
  const map = new Map<string, NoticeAttachmentDto[]>();
  for (const row of rows) {
    const list = map.get(row.noticeId) ?? [];
    list.push(attachmentDto(row));
    map.set(row.noticeId, list);
  }
  return map;
}

function toDto(
  row: typeof notices.$inferSelect,
  attachments: NoticeAttachmentDto[] = [],
): NoticeDto {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    wingId: row.wingId,
    flatId: row.flatId,
    publishedAt: row.publishedAt ? toApiIsoDateTime(row.publishedAt) : null,
    unpublishedAt: row.unpublishedAt ? toApiIsoDateTime(row.unpublishedAt) : null,
    createdAt: toApiIsoDateTime(row.createdAt),
    attachments,
  };
}

async function toDtoWithAttachments(
  row: typeof notices.$inferSelect,
): Promise<NoticeDto> {
  const map = await loadAttachments([row.id], row.tenantId);
  return toDto(row, map.get(row.id) ?? []);
}

async function assertCanAccessNoticeMedia(
  claims: { role: string; tenantId: string; flatId?: string | null; sub: string },
  notice: typeof notices.$inferSelect,
) {
  if (isStaffRole(claims.role as never)) return;
  if (!notice.publishedAt || notice.unpublishedAt) {
    throw new AppError(404, "not_found", "Media not found");
  }
  if (notice.audience === "all") return;
  let wingId: string | null = null;
  if (claims.flatId) {
    const [flat] = await db.select().from(flats).where(eq(flats.id, claims.flatId)).limit(1);
    wingId = flat?.wingId ?? null;
  }
  if (notice.audience === "wing" && wingId && notice.wingId === wingId) return;
  if (notice.audience === "flat" && claims.flatId && notice.flatId === claims.flatId) return;
  throw new AppError(404, "not_found", "Media not found");
}

function noticeOrderBy(
  sort: "createdAt" | "publishedAt" | "title",
  order: "asc" | "desc",
) {
  const col =
    sort === "title"
      ? notices.title
      : sort === "publishedAt"
        ? notices.publishedAt
        : notices.createdAt;
  return order === "asc" ? asc(col) : desc(col);
}

function publishedFilter() {
  return and(isNotNull(notices.publishedAt), isNull(notices.unpublishedAt));
}

function draftFilter() {
  return or(isNull(notices.publishedAt), isNotNull(notices.unpublishedAt));
}

export const noticeRoutes = new Elysia({ prefix: "/v1/notices" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const q = noticeListQuerySchema.parse(query ?? {});
    const offset = (q.page - 1) * q.limit;
    const filters: SQL[] = [
      eq(notices.tenantId, claims.tenantId),
      eq(notices.isDeleted, false),
    ];

    if (q.search?.trim()) {
      const term = `%${q.search.trim().toLowerCase()}%`;
      filters.push(
        or(
          like(sql`lower(${notices.title})`, term),
          like(sql`lower(${notices.body})`, term),
        )!,
      );
    }

    if (isStaffRole(claims.role)) {
      if (q.status === "published") {
        const pub = publishedFilter();
        if (pub) filters.push(pub);
      } else if (q.status === "draft") {
        const draft = draftFilter();
        if (draft) filters.push(draft);
      }
    } else {
      const pub = publishedFilter();
      if (pub) filters.push(pub);

      let wingId: string | null = null;
      if (claims.flatId) {
        const [flat] = await db
          .select()
          .from(flats)
          .where(eq(flats.id, claims.flatId))
          .limit(1);
        wingId = flat?.wingId ?? null;
      }

      const audienceParts: SQL[] = [eq(notices.audience, "all")];
      if (wingId) {
        audienceParts.push(
          and(eq(notices.audience, "wing"), eq(notices.wingId, wingId))!,
        );
      }
      if (claims.flatId) {
        audienceParts.push(
          and(eq(notices.audience, "flat"), eq(notices.flatId, claims.flatId))!,
        );
      }
      filters.push(or(...audienceParts)!);
    }

    const where = and(...filters);
    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(notices)
        .where(where)
        .orderBy(noticeOrderBy(q.sort, q.order))
        .limit(q.limit)
        .offset(offset),
      db.select({ total: count() }).from(notices).where(where),
    ]);

    const map = await loadAttachments(
      rows.map((r) => r.id),
      claims.tenantId,
    );
    const page: Paginated<NoticeDto> = {
      items: rows.map((r) => toDto(r, map.get(r.id) ?? [])),
      page: q.page,
      limit: q.limit,
      total: Number(totalRow?.total ?? 0),
    };
    return page;
  })
  .get("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [row] = await db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.id, params.id),
          eq(notices.tenantId, claims.tenantId),
          eq(notices.isDeleted, false),
        ),
      )
      .limit(1);
    if (!row) throw new AppError(404, "not_found", "Notice not found");
    if (!isStaffRole(claims.role)) {
      await assertCanAccessNoticeMedia(claims, row);
    }
    return toDtoWithAttachments(row);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = createNoticeSchema.parse(body);
    const id = crypto.randomUUID();
    await db.insert(notices).values({
      id,
      tenantId: claims.tenantId,
      title: parsed.title,
      body: parsed.body,
      audience: parsed.audience,
      wingId: parsed.wingId ?? null,
      flatId: parsed.flatId ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });
    const [row] = await db.select().from(notices).where(eq(notices.id, id)).limit(1);
    return toDto(row!, []);
  })
  .patch("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateNoticeSchema.parse(body);
    const [existing] = await db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.id, params.id),
          eq(notices.tenantId, claims.tenantId),
          eq(notices.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Notice not found");

    await db
      .update(notices)
      .set({
        title: parsed.title ?? existing.title,
        body: parsed.body ?? existing.body,
        updatedBy: claims.sub,
      })
      .where(eq(notices.id, params.id));
    const [row] = await db.select().from(notices).where(eq(notices.id, params.id)).limit(1);
    return toDtoWithAttachments(row!);
  })
  .post("/:id/attachments", async ({ auth, params, request }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.id, params.id),
          eq(notices.tenantId, claims.tenantId),
          eq(notices.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Notice not found");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError(400, "file_required", "file is required");
    }
    const contentType = file.type || "application/octet-stream";
    const isImage = contentType.startsWith("image/");
    const isVideo = contentType.startsWith("video/");
    if (!isImage && !isVideo) {
      throw new AppError(400, "invalid_type", "Only images and videos allowed");
    }
    const max = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > max) {
      throw new AppError(400, "file_too_large", "File exceeds size limit");
    }

    const existingAtt = await db
      .select({ id: noticeAttachments.id })
      .from(noticeAttachments)
      .where(
        and(
          eq(noticeAttachments.noticeId, params.id),
          eq(noticeAttachments.isDeleted, false),
        ),
      );
    if (existingAtt.length >= 5) {
      throw new AppError(400, "too_many", "At most 5 media files per notice");
    }

    await mkdir(env.uploadDir, { recursive: true });
    const attachmentId = crypto.randomUUID();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const rel = `${claims.tenantId}/notices/${params.id}/${attachmentId}.${ext}`;
    await mkdir(join(env.uploadDir, claims.tenantId, "notices", params.id), {
      recursive: true,
    });
    await Bun.write(join(env.uploadDir, rel), file);

    await db.insert(noticeAttachments).values({
      id: attachmentId,
      tenantId: claims.tenantId,
      noticeId: params.id,
      contentKind: isImage ? "image" : "video",
      contentType,
      blobPath: rel,
      byteSize: file.size,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    return toDtoWithAttachments(existing);
  })
  .delete("/:id/attachments/:attachmentId", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [att] = await db
      .select()
      .from(noticeAttachments)
      .where(
        and(
          eq(noticeAttachments.id, params.attachmentId),
          eq(noticeAttachments.noticeId, params.id),
          eq(noticeAttachments.tenantId, claims.tenantId),
          eq(noticeAttachments.isDeleted, false),
        ),
      )
      .limit(1);
    if (!att) throw new AppError(404, "not_found", "Attachment not found");
    await softDelete(noticeAttachments, att.id, claims.sub);
    const [row] = await db
      .select()
      .from(notices)
      .where(eq(notices.id, params.id))
      .limit(1);
    return toDtoWithAttachments(row!);
  })
  .post("/:id/publish", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.id, params.id),
          eq(notices.tenantId, claims.tenantId),
          eq(notices.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Notice not found");

    await db
      .update(notices)
      .set({ publishedAt: nowMysql(), unpublishedAt: null, updatedBy: claims.sub })
      .where(eq(notices.id, params.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "notice.published",
      entityType: "notice",
      entityId: params.id,
    });

    const [row] = await db.select().from(notices).where(eq(notices.id, params.id)).limit(1);
    return toDtoWithAttachments(row!);
  })
  .post("/:id/unpublish", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const [existing] = await db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.id, params.id),
          eq(notices.tenantId, claims.tenantId),
          eq(notices.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Notice not found");

    await db
      .update(notices)
      .set({ unpublishedAt: nowMysql(), updatedBy: claims.sub })
      .where(eq(notices.id, params.id));

    const [row] = await db.select().from(notices).where(eq(notices.id, params.id)).limit(1);
    return toDtoWithAttachments(row!);
  })
  .post("/:id/read", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [existing] = await db
      .select()
      .from(noticeReads)
      .where(and(eq(noticeReads.noticeId, params.id), eq(noticeReads.userId, claims.sub)))
      .limit(1);
    if (!existing) {
      await db.insert(noticeReads).values({
        id: crypto.randomUUID(),
        tenantId: claims.tenantId,
        noticeId: params.id,
        userId: claims.sub,
      });
    }
    return { ok: true as const };
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    await softDelete(notices, params.id, claims.sub);
    return { ok: true as const };
  });

export const noticeMediaRoutes = new Elysia({ prefix: "/v1/notice-media" })
  .use(authPlugin)
  .get("/:id", async ({ auth, params, query }) => {
    let claims = auth;
    if (!claims && typeof query.access_token === "string") {
      try {
        const { verifyAccessToken } = await import("@society-hub/auth");
        claims = await verifyAccessToken(query.access_token, env.jwtSecret);
      } catch {
        claims = null;
      }
    }
    claims = requireAuth(claims);
    const [att] = await db
      .select()
      .from(noticeAttachments)
      .where(
        and(
          eq(noticeAttachments.id, params.id),
          eq(noticeAttachments.tenantId, claims.tenantId),
          eq(noticeAttachments.isDeleted, false),
        ),
      )
      .limit(1);
    if (!att) throw new AppError(404, "not_found", "Media not found");
    const [notice] = await db
      .select()
      .from(notices)
      .where(
        and(
          eq(notices.id, att.noticeId),
          eq(notices.tenantId, claims.tenantId),
          eq(notices.isDeleted, false),
        ),
      )
      .limit(1);
    if (!notice) throw new AppError(404, "not_found", "Media not found");
    await assertCanAccessNoticeMedia(claims, notice);
    const file = Bun.file(join(env.uploadDir, att.blobPath));
    if (!(await file.exists())) {
      throw new AppError(404, "not_found", "File missing");
    }
    return new Response(file, {
      headers: { "Content-Type": att.contentType },
    });
  });
