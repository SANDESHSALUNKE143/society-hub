import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { ResidentDocumentDto, ResidentDocumentType } from "@society-hub/types";
import { env } from "../../config";
import { db } from "../../db/client";
import { residents, users, verificationDocuments } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { ActivityType, AuditEntity, recordAudit } from "../../lib/audit";
import { notifyUser } from "../../lib/notify";
import { toMysqlDateTime } from "../../lib/resident-lifecycle";
import { getResidentRow, toDocumentDto } from "./repository";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

export type StoreDocumentInput = {
  tenantId: string;
  actorUserId: string;
  residentId: string;
  file: FormDataEntryValue | null;
  meta: {
    docType: ResidentDocumentType;
    documentNumber?: string | null;
    expiresAt?: string | null;
  };
};

/**
 * Writes a verification document under a tenant-partitioned path. The blob path
 * is never returned to clients — files are only reachable through the
 * authenticated, tenant-checked download route below.
 */
export async function storeDocument(
  input: StoreDocumentInput,
): Promise<ResidentDocumentDto> {
  const resident = await getResidentRow(input.tenantId, input.residentId);
  const file = input.file;
  if (!(file instanceof File)) {
    throw new AppError(400, "file_required", "file is required");
  }
  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new AppError(
      400,
      "invalid_type",
      "Only JPEG, PNG, WEBP, HEIC images or PDF files are allowed",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new AppError(400, "file_too_large", "File exceeds the 10 MB limit");
  }

  const documentId = crypto.randomUUID();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const dir = join(env.uploadDir, input.tenantId, "residents", input.residentId);
  const rel = `${input.tenantId}/residents/${input.residentId}/${documentId}.${ext}`;
  await mkdir(dir, { recursive: true });
  await Bun.write(join(env.uploadDir, rel), file);

  await db.insert(verificationDocuments).values({
    id: documentId,
    tenantId: input.tenantId,
    residentId: input.residentId,
    docType: input.meta.docType,
    documentNumber: input.meta.documentNumber ?? null,
    fileName: file.name,
    blobPath: rel,
    contentType,
    byteSize: file.size,
    status: "pending",
    uploadedByUserId: input.actorUserId,
    expiresAt: input.meta.expiresAt ? toMysqlDateTime(input.meta.expiresAt) : null,
    createdBy: input.actorUserId,
    updatedBy: input.actorUserId,
  });

  // Uploading puts the membership (back) into the review queue — both for a
  // first submission and for a replacement after a rejection. An already
  // approved membership is left alone; a new document does not un-verify it.
  if (
    resident.verificationStatus === "pending" ||
    resident.verificationStatus === "rejected"
  ) {
    await db
      .update(residents)
      .set({ verificationStatus: "under_review", updatedBy: input.actorUserId })
      .where(eq(residents.id, input.residentId));
  }

  await recordAudit({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: ActivityType.DOCUMENT_UPLOADED,
    entityType: AuditEntity.DOCUMENT,
    entityId: documentId,
    message: `Uploaded ${input.meta.docType.replace(/_/g, " ")} document`,
    // Metadata only — never the file contents or a full document number.
    meta: {
      residentId: input.residentId,
      docType: input.meta.docType,
      contentType,
      byteSize: file.size,
    },
  });

  const [row] = await db
    .select()
    .from(verificationDocuments)
    .where(eq(verificationDocuments.id, documentId))
    .limit(1);
  return toDocumentDto(row!, null);
}

/** Loads a document and proves it belongs to the caller's society. */
export async function getDocumentRow(tenantId: string, documentId: string) {
  const [row] = await db
    .select()
    .from(verificationDocuments)
    .where(
      and(
        eq(verificationDocuments.id, documentId),
        eq(verificationDocuments.tenantId, tenantId),
        eq(verificationDocuments.isDeleted, false),
      ),
    )
    .limit(1);
  if (!row) throw new AppError(404, "not_found", "Document not found");
  return row;
}

export async function reviewDocument(opts: {
  tenantId: string;
  actorUserId: string;
  documentId: string;
  approved: boolean;
  reason?: string | null;
}): Promise<ResidentDocumentDto> {
  const row = await getDocumentRow(opts.tenantId, opts.documentId);
  const resident = await getResidentRow(opts.tenantId, row.residentId);
  const now = toMysqlDateTime();

  await db
    .update(verificationDocuments)
    .set({
      status: opts.approved ? "approved" : "rejected",
      verifiedBy: opts.actorUserId,
      verifiedAt: now,
      rejectionReason: opts.approved ? null : (opts.reason ?? null),
      updatedBy: opts.actorUserId,
    })
    .where(eq(verificationDocuments.id, opts.documentId));

  await recordAudit({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    action: opts.approved
      ? ActivityType.DOCUMENT_VERIFIED
      : ActivityType.DOCUMENT_REJECTED,
    entityType: AuditEntity.DOCUMENT,
    entityId: opts.documentId,
    message: opts.approved
      ? `Approved ${row.docType.replace(/_/g, " ")} document`
      : `Rejected ${row.docType.replace(/_/g, " ")} document — ${opts.reason ?? "no reason given"}`,
    meta: { residentId: row.residentId, docType: row.docType },
  });

  if (!opts.approved) {
    await notifyUser({
      tenantId: opts.tenantId,
      userId: resident.userId,
      title: "Document rejected",
      body: `Your ${row.docType.replace(/_/g, " ")} document was rejected. Reason: ${
        opts.reason ?? "not provided"
      }`,
      kind: "verification",
      linkPath: "/account",
    });
  }

  const [updated] = await db
    .select({ doc: verificationDocuments, verifierName: users.name })
    .from(verificationDocuments)
    .leftJoin(users, eq(users.id, verificationDocuments.verifiedBy))
    .where(eq(verificationDocuments.id, opts.documentId))
    .limit(1);
  return toDocumentDto(updated!.doc, updated!.verifierName);
}

/**
 * Streams the stored file. Callers must already be authorized; this records the
 * access so document reads are auditable.
 */
export async function readDocumentFile(opts: {
  tenantId: string;
  actorUserId: string;
  documentId: string;
}) {
  const row = await getDocumentRow(opts.tenantId, opts.documentId);
  const file = Bun.file(join(env.uploadDir, row.blobPath));
  if (!(await file.exists())) {
    throw new AppError(404, "not_found", "File missing");
  }
  await recordAudit({
    tenantId: opts.tenantId,
    actorUserId: opts.actorUserId,
    action: ActivityType.DOCUMENT_VIEWED,
    entityType: AuditEntity.DOCUMENT,
    entityId: opts.documentId,
    message: `Viewed ${row.docType.replace(/_/g, " ")} document`,
    meta: { residentId: row.residentId },
  });
  return new Response(file, {
    headers: {
      "Content-Type": row.contentType,
      // Documents are private: never let a shared cache retain them.
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${row.fileName.replace(/"/g, "")}"`,
    },
  });
}
