import { Elysia } from "elysia";
import { and, count, desc, eq, inArray, lt } from "drizzle-orm";
import type { ComplaintDto, ComplaintStatus } from "@society-hub/types";
import {
  createComplaintCommentSchema,
  createComplaintSchema,
  listQuerySchema,
  updateComplaintSchema,
  updateComplaintStatusSchema,
} from "@society-hub/validation";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { env } from "../../config";
import { db } from "../../db/client";
import {
  complaintAttachments,
  complaintComments,
  complaintStatusEvents,
  complaints,
  flats,
  societies,
  users,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import { softDelete } from "../../lib/soft-delete";
import { notifyStaffNewComplaint } from "../../lib/messaging/notify-complaint-staff";
import {
  authPlugin,
  isStaffRole,
  requireAuth,
  requireRole,
  requireSocietyStaff,
} from "../../lib/auth-context";
import { toApiIsoDateTime } from "../../lib/api-datetime";
import {
  canDeleteComplaint,
  canResidentEditComplaint,
} from "./complaint-access";
import { resolveComplaintFlatId } from "./resolve-complaint-flat";
import {
  assertCanViewComplaint,
  listActiveFlatIdsForUser,
} from "./flat-access";

function slaDueAt(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ")
    .replace("Z", "");
}

const QUEUE_STATUSES: ComplaintStatus[] = ["open", "assigned"];

async function queueMeta(
  tenantId: string,
  createdAt: string,
  status: ComplaintStatus,
): Promise<{
  queuePosition: number | null;
  openAheadCount: number | null;
  queueHint: string | null;
}> {
  if (!QUEUE_STATUSES.includes(status)) {
    return { queuePosition: null, openAheadCount: null, queueHint: null };
  }
  const [ahead] = await db
    .select({ total: count() })
    .from(complaints)
    .where(
      and(
        eq(complaints.tenantId, tenantId),
        eq(complaints.isDeleted, false),
        inArray(complaints.status, QUEUE_STATUSES),
        lt(complaints.createdAt, createdAt),
      ),
    );
  const openAheadCount = Number(ahead?.total ?? 0);
  const queuePosition = openAheadCount + 1;
  const queueHint =
    openAheadCount === 0
      ? "You are next in the queue — the office will pick this up soon."
      : openAheadCount === 1
        ? "About 1 ticket ahead of yours in the queue."
        : `About ${openAheadCount} tickets ahead of yours in the queue.`;
  return { queuePosition, openAheadCount, queueHint };
}

async function toComplaintDto(complaintId: string, tenantId: string): Promise<ComplaintDto> {
  const [row] = await db
    .select({
      complaint: complaints,
      flatNumber: flats.number,
      residentName: users.name,
    })
    .from(complaints)
    .innerJoin(flats, eq(flats.id, complaints.flatId))
    .leftJoin(users, eq(users.id, complaints.raisedByUserId))
    .where(
      and(
        eq(complaints.id, complaintId),
        eq(complaints.tenantId, tenantId),
        eq(complaints.isDeleted, false),
      ),
    )
    .limit(1);

  if (!row) throw new AppError(404, "not_found", "Complaint not found");

  const attachments = await db
    .select()
    .from(complaintAttachments)
    .where(
      and(
        eq(complaintAttachments.complaintId, complaintId),
        eq(complaintAttachments.isDeleted, false),
      ),
    );

  const comments = await db
    .select({
      id: complaintComments.id,
      complaintId: complaintComments.complaintId,
      userId: complaintComments.userId,
      authorName: users.name,
      body: complaintComments.body,
      kind: complaintComments.kind,
      createdAt: complaintComments.createdAt,
    })
    .from(complaintComments)
    .leftJoin(users, eq(users.id, complaintComments.userId))
    .where(
      and(
        eq(complaintComments.complaintId, complaintId),
        eq(complaintComments.isDeleted, false),
      ),
    )
    .orderBy(complaintComments.createdAt);

  const events = await db
    .select({
      id: complaintStatusEvents.id,
      fromStatus: complaintStatusEvents.fromStatus,
      toStatus: complaintStatusEvents.toStatus,
      note: complaintStatusEvents.note,
      actorName: users.name,
      createdAt: complaintStatusEvents.createdAt,
    })
    .from(complaintStatusEvents)
    .leftJoin(users, eq(users.id, complaintStatusEvents.actorUserId))
    .where(
      and(
        eq(complaintStatusEvents.complaintId, complaintId),
        eq(complaintStatusEvents.isDeleted, false),
      ),
    )
    .orderBy(complaintStatusEvents.createdAt);

  const closing = [...events]
    .reverse()
    .find((e) => e.toStatus === "resolved" || e.toStatus === "closed");

  const queue = await queueMeta(
    tenantId,
    row.complaint.createdAt,
    row.complaint.status as ComplaintStatus,
  );

  return {
    id: row.complaint.id,
    ticketNumber: row.complaint.ticketNumber,
    title: row.complaint.title,
    type: row.complaint.type,
    typeOtherText: row.complaint.typeOtherText,
    description: row.complaint.description,
    status: row.complaint.status,
    flatId: row.complaint.flatId,
    flatNumber: row.flatNumber,
    residentName: row.residentName,
    assignedToUserId: row.complaint.assignedToUserId,
    slaDueAt: row.complaint.slaDueAt
      ? toApiIsoDateTime(row.complaint.slaDueAt)
      : null,
    createdAt: toApiIsoDateTime(row.complaint.createdAt),
    updatedAt: toApiIsoDateTime(row.complaint.updatedAt),
    ...queue,
    attachments: attachments.map((a) => ({
      id: a.id,
      contentKind: a.contentKind,
      contentType: a.contentType,
      url: `${env.publicApiUrl}/v1/media/${a.id}`,
      byteSize: a.byteSize,
    })),
    comments: comments.map((c) => ({
      ...c,
      kind: c.kind === "question" ? "question" : "comment",
      createdAt: toApiIsoDateTime(c.createdAt),
    })),
    statusEvents: events.map((e) => ({
      id: e.id,
      fromStatus: (e.fromStatus as ComplaintStatus | null) ?? null,
      toStatus: e.toStatus as ComplaintStatus,
      note: e.note,
      actorName: e.actorName,
      createdAt: toApiIsoDateTime(e.createdAt),
    })),
    closingNote: closing?.note ?? null,
  };
}

export const complaintRoutes = new Elysia({ prefix: "/v1/complaints" })
  .use(authPlugin)
  .get("/", async ({ auth, query }) => {
    const claims = requireAuth(auth);
    const q = listQuerySchema.parse(query);
    const offset = (q.page - 1) * q.limit;

    const societyWide = isStaffRole(claims.role) && !q.mine;
    let where;
    if (societyWide) {
      where = and(
        eq(complaints.tenantId, claims.tenantId),
        eq(complaints.isDeleted, false),
      );
    } else {
      const flatIds = await listActiveFlatIdsForUser(claims.tenantId, claims.sub);
      if (flatIds.length === 0) {
        return { items: [], page: q.page, limit: q.limit, total: 0 };
      }
      where = and(
        eq(complaints.tenantId, claims.tenantId),
        inArray(complaints.flatId, flatIds),
        eq(complaints.isDeleted, false),
      );
    }

    const countRows = await db
      .select({ total: count() })
      .from(complaints)
      .where(where);
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await db
      .select({ id: complaints.id })
      .from(complaints)
      .where(where)
      .orderBy(desc(complaints.createdAt))
      .limit(q.limit)
      .offset(offset);

    const items = await Promise.all(
      rows.map((r) => toComplaintDto(r.id, claims.tenantId)),
    );

    return { items, page: q.page, limit: q.limit, total };
  })
  .get("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [c] = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.id, params.id),
          eq(complaints.tenantId, claims.tenantId),
          eq(complaints.isDeleted, false),
        ),
      )
      .limit(1);
    if (!c) throw new AppError(404, "not_found", "Complaint not found");
    await assertCanViewComplaint({
      role: claims.role,
      tenantId: claims.tenantId,
      userId: claims.sub,
      complaintFlatId: c.flatId,
    });
    return toComplaintDto(params.id, claims.tenantId);
  })
  .post("/", async ({ auth, body }) => {
    const claims = requireAuth(auth);
    requireRole(claims, [
      "resident",
      "tenant",
      "chairperson",
      "admin",
      "secretary",
      "treasurer",
      "cashier",
      "committee",
    ]);
    const parsed = createComplaintSchema.parse(body);

    // Residents use their linked flat; staff may pick any tenant flat in-body.
    const flatId = resolveComplaintFlatId({
      role: claims.role,
      linkedFlatId: claims.flatId,
      requestedFlatId: parsed.flatId,
    });

    const [flat] = await db
      .select()
      .from(flats)
      .where(
        and(
          eq(flats.id, flatId),
          eq(flats.tenantId, claims.tenantId),
          eq(flats.isDeleted, false),
        ),
      )
      .limit(1);
    if (!flat) throw new AppError(404, "flat_not_found", "Flat not found");

    const [society] = await db
      .select({ slaDays: societies.slaDays, name: societies.name })
      .from(societies)
      .where(eq(societies.id, claims.tenantId))
      .limit(1);

    const ticketNumber = `C-${Date.now().toString().slice(-8)}`;
    const id = crypto.randomUUID();
    await db.insert(complaints).values({
      id,
      tenantId: claims.tenantId,
      ticketNumber,
      title: parsed.title,
      type: parsed.type,
      typeOtherText: parsed.type === "other" ? parsed.typeOtherText ?? null : null,
      description: parsed.description,
      status: "open",
      flatId,
      raisedByUserId: claims.sub,
      slaDueAt: slaDueAt(society?.slaDays ?? 3),
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "complaint.created",
      entityType: "complaint",
      entityId: id,
      meta: { ticketNumber },
    });

    const dto = await toComplaintDto(id, claims.tenantId);
    void notifyStaffNewComplaint({
      tenantId: claims.tenantId,
      societyName: society?.name ?? "your society",
      ticketNumber,
      title: parsed.title,
      type: parsed.type,
      flatNumber: dto.flatNumber,
      raisedByName: dto.residentName,
      complaintId: id,
    });

    return dto;
  })
  .patch("/:id/status", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    requireSocietyStaff(claims);
    const parsed = updateComplaintStatusSchema.parse(body);
    const [existing] = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.id, params.id),
          eq(complaints.tenantId, claims.tenantId),
          eq(complaints.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Complaint not found");

    const assignedToUserId =
      parsed.status === "assigned"
        ? parsed.assignedToUserId ?? claims.sub
        : parsed.assignedToUserId ?? existing.assignedToUserId;

    await db
      .update(complaints)
      .set({
        status: parsed.status,
        assignedToUserId,
        updatedBy: claims.sub,
      })
      .where(eq(complaints.id, params.id));

    await db.insert(complaintStatusEvents).values({
      id: crypto.randomUUID(),
      tenantId: claims.tenantId,
      complaintId: params.id,
      fromStatus: existing.status,
      toStatus: parsed.status,
      actorUserId: claims.sub,
      note: parsed.note ?? null,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "complaint.status_changed",
      entityType: "complaint",
      entityId: params.id,
      meta: { from: existing.status, to: parsed.status },
    });

    await notifyUser({
      tenantId: claims.tenantId,
      userId: existing.raisedByUserId,
      title: `Complaint ${existing.ticketNumber} ${parsed.status.replace("_", " ")}`,
      body: parsed.note ?? `Status updated to ${parsed.status}`,
      kind: "complaint",
      linkPath: `/complaints/${params.id}`,
    });

    return toComplaintDto(params.id, claims.tenantId);
  })
  .patch("/:id", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    const parsed = updateComplaintSchema.parse(body);
    const [existing] = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.id, params.id),
          eq(complaints.tenantId, claims.tenantId),
          eq(complaints.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Complaint not found");
    if (
      !canResidentEditComplaint({
        role: claims.role,
        userId: claims.sub,
        raisedByUserId: existing.raisedByUserId,
        status: existing.status as ComplaintStatus,
      })
    ) {
      throw new AppError(403, "forbidden", "You cannot edit this complaint");
    }

    const nextType = parsed.type ?? existing.type;
    await db
      .update(complaints)
      .set({
        title: parsed.title ?? existing.title,
        type: nextType,
        typeOtherText:
          nextType === "other"
            ? (parsed.typeOtherText ?? existing.typeOtherText)
            : null,
        description: parsed.description ?? existing.description,
        updatedBy: claims.sub,
      })
      .where(eq(complaints.id, params.id));

    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "complaint.updated",
      entityType: "complaint",
      entityId: params.id,
      meta: { ticketNumber: existing.ticketNumber },
    });

    return toComplaintDto(params.id, claims.tenantId);
  })
  .get("/:id/comments", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [c] = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.id, params.id),
          eq(complaints.tenantId, claims.tenantId),
          eq(complaints.isDeleted, false),
        ),
      )
      .limit(1);
    if (!c) throw new AppError(404, "not_found", "Complaint not found");
    await assertCanViewComplaint({
      role: claims.role,
      tenantId: claims.tenantId,
      userId: claims.sub,
      complaintFlatId: c.flatId,
    });
    const dto = await toComplaintDto(params.id, claims.tenantId);
    return dto.comments;
  })
  .post("/:id/comments", async ({ auth, params, body }) => {
    const claims = requireAuth(auth);
    const parsed = createComplaintCommentSchema.parse(body);
    const [existing] = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.id, params.id),
          eq(complaints.tenantId, claims.tenantId),
          eq(complaints.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Complaint not found");
    await assertCanViewComplaint({
      role: claims.role,
      tenantId: claims.tenantId,
      userId: claims.sub,
      complaintFlatId: existing.flatId,
    });

    await db.insert(complaintComments).values({
      id: crypto.randomUUID(),
      tenantId: claims.tenantId,
      complaintId: params.id,
      userId: claims.sub,
      body: parsed.body,
      kind: parsed.kind,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    const label = parsed.kind === "question" ? "New question" : "New comment";
    if (claims.sub !== existing.raisedByUserId) {
      await notifyUser({
        tenantId: claims.tenantId,
        userId: existing.raisedByUserId,
        title: `${label} on ${existing.ticketNumber}`,
        body: parsed.body,
        kind: "complaint",
        linkPath: `/complaints/${params.id}`,
      });
    } else if (existing.assignedToUserId && existing.assignedToUserId !== claims.sub) {
      await notifyUser({
        tenantId: claims.tenantId,
        userId: existing.assignedToUserId,
        title: `${label} on ${existing.ticketNumber}`,
        body: parsed.body,
        kind: "complaint",
        linkPath: `/complaints/${params.id}`,
      });
    }

    return toComplaintDto(params.id, claims.tenantId);
  })
  .delete("/:id", async ({ auth, params }) => {
    const claims = requireAuth(auth);
    const [existing] = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.id, params.id),
          eq(complaints.tenantId, claims.tenantId),
          eq(complaints.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Complaint not found");
    if (
      !canDeleteComplaint({
        role: claims.role,
        userId: claims.sub,
        raisedByUserId: existing.raisedByUserId,
        status: existing.status as ComplaintStatus,
      })
    ) {
      throw new AppError(403, "forbidden", "You cannot delete this complaint");
    }

    await softDelete(complaints, params.id, claims.sub);
    await recordAudit({
      tenantId: claims.tenantId,
      actorUserId: claims.sub,
      action: "complaint.deleted",
      entityType: "complaint",
      entityId: params.id,
    });
    return { ok: true as const };
  })
  .post("/:id/attachments", async ({ auth, params, request }) => {
    const claims = requireAuth(auth);
    const [existing] = await db
      .select()
      .from(complaints)
      .where(
        and(
          eq(complaints.id, params.id),
          eq(complaints.tenantId, claims.tenantId),
          eq(complaints.isDeleted, false),
        ),
      )
      .limit(1);
    if (!existing) throw new AppError(404, "not_found", "Complaint not found");
    await assertCanViewComplaint({
      role: claims.role,
      tenantId: claims.tenantId,
      userId: claims.sub,
      complaintFlatId: existing.flatId,
    });

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

    await mkdir(env.uploadDir, { recursive: true });
    const attachmentId = crypto.randomUUID();
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const rel = `${claims.tenantId}/${params.id}/${attachmentId}.${ext}`;
    const abs = join(env.uploadDir, rel);
    await mkdir(join(env.uploadDir, claims.tenantId, params.id), {
      recursive: true,
    });
    await Bun.write(abs, file);

    await db.insert(complaintAttachments).values({
      id: attachmentId,
      tenantId: claims.tenantId,
      complaintId: params.id,
      contentKind: isImage ? "image" : "video",
      contentType,
      blobPath: rel,
      byteSize: file.size,
      createdBy: claims.sub,
      updatedBy: claims.sub,
    });

    return toComplaintDto(params.id, claims.tenantId);
  });

export const mediaRoutes = new Elysia({ prefix: "/v1/media" })
  .use(authPlugin)
  .get("/:id", async ({ auth, params, query }) => {
    // Allow Bearer or ?access_token= for <a href> / <img> in browsers
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
      .from(complaintAttachments)
      .where(
        and(
          eq(complaintAttachments.id, params.id),
          eq(complaintAttachments.tenantId, claims.tenantId),
          eq(complaintAttachments.isDeleted, false),
        ),
      )
      .limit(1);
    if (!att) throw new AppError(404, "not_found", "Media not found");
    const file = Bun.file(join(env.uploadDir, att.blobPath));
    if (!(await file.exists())) {
      throw new AppError(404, "not_found", "File missing");
    }
    return new Response(file, {
      headers: { "Content-Type": att.contentType },
    });
  });
