import {
  mysqlTable,
  varchar,
  char,
  datetime,
  boolean,
  text,
  int,
  mysqlEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

const id = () => char("id", { length: 36 }).primaryKey();
const tenantId = () => char("tenant_id", { length: 36 }).notNull();
const timestamps = {
  createdAt: datetime("created_at", { mode: "string", fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`),
  createdBy: char("created_by", { length: 36 }),
  updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)`),
  updatedBy: char("updated_by", { length: 36 }),
  isDeleted: boolean("is_deleted").notNull().default(false),
};

export const societies = mysqlTable("societies", {
  id: id(),
  name: varchar("name", { length: 200 }).notNull(),
  address: varchar("address", { length: 500 }),
  city: varchar("city", { length: 120 }),
  pincode: varchar("pincode", { length: 12 }),
  timezone: varchar("timezone", { length: 64 }).notNull().default("Asia/Kolkata"),
  slaDays: int("sla_days").notNull().default(3),
  billingDefaults: text("billing_defaults"),
  /** Offline UPI / bank details residents use to pay (Razorpay is future). */
  upiId: varchar("upi_id", { length: 80 }),
  accountName: varchar("account_name", { length: 120 }),
  accountNumber: varchar("account_number", { length: 40 }),
  ifsc: varchar("ifsc", { length: 20 }),
  qrBlobPath: varchar("qr_blob_path", { length: 500 }),
  qrContentType: varchar("qr_content_type", { length: 120 }),
  ...timestamps,
});

export const buildings = mysqlTable(
  "buildings",
  {
    id: id(),
    tenantId: tenantId(),
    name: varchar("name", { length: 120 }).notNull(),
    ...timestamps,
  },
  (t) => [index("buildings_tenant_idx").on(t.tenantId)],
);

export const wings = mysqlTable(
  "wings",
  {
    id: id(),
    tenantId: tenantId(),
    buildingId: char("building_id", { length: 36 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    ...timestamps,
  },
  (t) => [index("wings_tenant_idx").on(t.tenantId)],
);

export const flats = mysqlTable(
  "flats",
  {
    id: id(),
    tenantId: tenantId(),
    wingId: char("wing_id", { length: 36 }).notNull(),
    number: varchar("number", { length: 32 }).notNull(),
    /** Floor within the wing (null = unset). */
    floor: int("floor"),
    /** Primary parking slot label linked to this flat (optional). */
    parkingSlot: varchar("parking_slot", { length: 32 }),
    /** Extensible JSON bag for society-specific flat attributes. */
    detailsJson: text("details_json"),
    ...timestamps,
  },
  (t) => [
    index("flats_tenant_idx").on(t.tenantId),
    uniqueIndex("flats_tenant_number_uidx").on(t.tenantId, t.number),
  ],
);

export const users = mysqlTable(
  "users",
  {
    id: id(),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 200 }),
    name: varchar("name", { length: 120 }),
    username: varchar("username", { length: 64 }),
    passwordHash: varchar("password_hash", { length: 255 }),
    googleSub: varchar("google_sub", { length: 128 }),
    pinHash: varchar("pin_hash", { length: 255 }),
    pinUpdatedAt: datetime("pin_updated_at", { mode: "string", fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_phone_uidx").on(t.phone),
    uniqueIndex("users_email_uidx").on(t.email),
    uniqueIndex("users_username_uidx").on(t.username),
  ],
);

export const userRoles = mysqlTable(
  "user_roles",
  {
    id: id(),
    tenantId: tenantId(),
    userId: char("user_id", { length: 36 }).notNull(),
    role: mysqlEnum("role", [
      "superadmin",
      "chairperson",
      "admin",
      "secretary",
      "treasurer",
      "cashier",
      "committee",
      "resident",
      "tenant",
    ]).notNull(),
    ...timestamps,
  },
  (t) => [
    index("user_roles_tenant_user_idx").on(t.tenantId, t.userId),
    uniqueIndex("user_roles_tenant_user_role_uidx").on(
      t.tenantId,
      t.userId,
      t.role,
    ),
  ],
);

export const residents = mysqlTable(
  "residents",
  {
    id: id(),
    tenantId: tenantId(),
    userId: char("user_id", { length: 36 }).notNull(),
    flatId: char("flat_id", { length: 36 }).notNull(),
    isOwner: boolean("is_owner").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("residents_tenant_idx").on(t.tenantId),
    uniqueIndex("residents_tenant_user_uidx").on(t.tenantId, t.userId),
  ],
);

export const otpChallenges = mysqlTable(
  "otp_challenges",
  {
    id: id(),
    phone: varchar("phone", { length: 20 }).notNull(),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
    consumedAt: datetime("consumed_at", { mode: "string", fsp: 3 }),
    attempts: int("attempts").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("otp_phone_idx").on(t.phone)],
);

export const passwordResetChallenges = mysqlTable(
  "password_reset_challenges",
  {
    id: id(),
    email: varchar("email", { length: 200 }).notNull(),
    codeHash: varchar("code_hash", { length: 255 }).notNull(),
    expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
    consumedAt: datetime("consumed_at", { mode: "string", fsp: 3 }),
    attempts: int("attempts").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("password_reset_email_idx").on(t.email)],
);

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: id(),
    userId: char("user_id", { length: 36 }).notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: datetime("expires_at", { mode: "string", fsp: 3 }).notNull(),
    revokedAt: datetime("revoked_at", { mode: "string", fsp: 3 }),
    ...timestamps,
  },
  (t) => [index("refresh_user_idx").on(t.userId)],
);

export const complaints = mysqlTable(
  "complaints",
  {
    id: id(),
    tenantId: tenantId(),
    ticketNumber: varchar("ticket_number", { length: 32 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    type: mysqlEnum("type", [
      "electric",
      "plumbing",
      "housekeeping",
      "security",
      "lift",
      "other",
    ]).notNull(),
    typeOtherText: varchar("type_other_text", { length: 120 }),
    description: text("description").notNull(),
    status: mysqlEnum("status", [
      "open",
      "assigned",
      "in_progress",
      "resolved",
      "closed",
    ])
      .notNull()
      .default("open"),
    flatId: char("flat_id", { length: 36 }).notNull(),
    raisedByUserId: char("raised_by_user_id", { length: 36 }).notNull(),
    assignedToUserId: char("assigned_to_user_id", { length: 36 }),
    slaDueAt: datetime("sla_due_at", { mode: "string", fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    index("complaints_tenant_status_idx").on(t.tenantId, t.status),
    uniqueIndex("complaints_tenant_ticket_uidx").on(t.tenantId, t.ticketNumber),
  ],
);

export const complaintComments = mysqlTable(
  "complaint_comments",
  {
    id: id(),
    tenantId: tenantId(),
    complaintId: char("complaint_id", { length: 36 }).notNull(),
    userId: char("user_id", { length: 36 }).notNull(),
    body: text("body").notNull(),
    ...timestamps,
  },
  (t) => [index("complaint_comments_complaint_idx").on(t.complaintId)],
);

export const complaintStatusEvents = mysqlTable(
  "complaint_status_events",
  {
    id: id(),
    tenantId: tenantId(),
    complaintId: char("complaint_id", { length: 36 }).notNull(),
    fromStatus: varchar("from_status", { length: 32 }),
    toStatus: varchar("to_status", { length: 32 }).notNull(),
    actorUserId: char("actor_user_id", { length: 36 }).notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [index("complaint_status_events_complaint_idx").on(t.complaintId)],
);

export const complaintAttachments = mysqlTable(
  "complaint_attachments",
  {
    id: id(),
    tenantId: tenantId(),
    complaintId: char("complaint_id", { length: 36 }).notNull(),
    contentKind: mysqlEnum("content_kind", ["image", "video"]).notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    blobPath: varchar("blob_path", { length: 500 }).notNull(),
    byteSize: int("byte_size").notNull(),
    durationSeconds: int("duration_seconds"),
    ...timestamps,
  },
  (t) => [index("attachments_complaint_idx").on(t.complaintId)],
);

export const invitations = mysqlTable(
  "invitations",
  {
    id: id(),
    tenantId: tenantId(),
    email: varchar("email", { length: 200 }),
    phone: varchar("phone", { length: 20 }),
    role: mysqlEnum("role", [
      "superadmin",
      "chairperson",
      "admin",
      "secretary",
      "treasurer",
      "cashier",
      "committee",
      "resident",
      "tenant",
    ]).notNull(),
    token: varchar("token", { length: 128 }).notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "revoked"])
      .notNull()
      .default("pending"),
    invitedBy: char("invited_by", { length: 36 }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("invitations_tenant_idx").on(t.tenantId),
    uniqueIndex("invitations_token_uidx").on(t.token),
  ],
);

export const residentProfiles = mysqlTable(
  "resident_profiles",
  {
    id: id(),
    tenantId: tenantId(),
    userId: char("user_id", { length: 36 }).notNull(),
    emergencyContact: varchar("emergency_contact", { length: 40 }),
    vehicleNumber: varchar("vehicle_number", { length: 32 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("resident_profiles_tenant_user_uidx").on(t.tenantId, t.userId),
  ],
);

export const verificationDocuments = mysqlTable(
  "verification_documents",
  {
    id: id(),
    tenantId: tenantId(),
    residentId: char("resident_id", { length: 36 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    blobPath: varchar("blob_path", { length: 500 }).notNull(),
    contentType: varchar("content_type", { length: 120 }).notNull(),
    ...timestamps,
  },
  (t) => [index("verification_documents_resident_idx").on(t.residentId)],
);

export const bills = mysqlTable(
  "bills",
  {
    id: id(),
    tenantId: tenantId(),
    flatId: char("flat_id", { length: 36 }).notNull(),
    periodYm: varchar("period_ym", { length: 7 }).notNull(),
    amountPaise: int("amount_paise").notNull(),
    status: mysqlEnum("status", [
      "draft",
      "issued",
      "paid",
      "void",
      "corrected",
    ])
      .notNull()
      .default("draft"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("bills_tenant_flat_idx").on(t.tenantId, t.flatId),
    index("bills_tenant_period_idx").on(t.tenantId, t.periodYm),
  ],
);

export const billLineItems = mysqlTable(
  "bill_line_items",
  {
    id: id(),
    tenantId: tenantId(),
    billId: char("bill_id", { length: 36 }).notNull(),
    label: varchar("label", { length: 200 }).notNull(),
    amountPaise: int("amount_paise").notNull(),
    ...timestamps,
  },
  (t) => [index("bill_line_items_bill_idx").on(t.billId)],
);

export const payments = mysqlTable(
  "payments",
  {
    id: id(),
    tenantId: tenantId(),
    billId: char("bill_id", { length: 36 }),
    flatId: char("flat_id", { length: 36 }).notNull(),
    amountPaise: int("amount_paise").notNull(),
    method: mysqlEnum("method", ["razorpay", "cash", "cheque", "neft", "upi"]).notNull(),
    status: mysqlEnum("status", ["pending", "success", "failed"])
      .notNull()
      .default("pending"),
    razorpayOrderId: varchar("razorpay_order_id", { length: 120 }),
    razorpayPaymentId: varchar("razorpay_payment_id", { length: 120 }),
    receiptNumber: varchar("receipt_number", { length: 64 }),
    proofBlobPath: varchar("proof_blob_path", { length: 500 }),
    proofContentType: varchar("proof_content_type", { length: 120 }),
    reviewNote: varchar("review_note", { length: 500 }),
    ...timestamps,
  },
  (t) => [
    index("payments_tenant_flat_idx").on(t.tenantId, t.flatId),
    index("payments_tenant_bill_idx").on(t.tenantId, t.billId),
  ],
);

export const notices = mysqlTable(
  "notices",
  {
    id: id(),
    tenantId: tenantId(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    audience: mysqlEnum("audience", ["all", "wing", "flat"])
      .notNull()
      .default("all"),
    wingId: char("wing_id", { length: 36 }),
    flatId: char("flat_id", { length: 36 }),
    publishedAt: datetime("published_at", { mode: "string", fsp: 3 }),
    unpublishedAt: datetime("unpublished_at", { mode: "string", fsp: 3 }),
    ...timestamps,
  },
  (t) => [index("notices_tenant_idx").on(t.tenantId)],
);

export const noticeReads = mysqlTable(
  "notice_reads",
  {
    id: id(),
    tenantId: tenantId(),
    noticeId: char("notice_id", { length: 36 }).notNull(),
    userId: char("user_id", { length: 36 }).notNull(),
    readAt: datetime("read_at", { mode: "string", fsp: 3 })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP(3)`),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("notice_reads_notice_user_uidx").on(t.noticeId, t.userId),
  ],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: id(),
    tenantId: tenantId(),
    userId: char("user_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    kind: varchar("kind", { length: 40 }).notNull().default("general"),
    readAt: datetime("read_at", { mode: "string", fsp: 3 }),
    linkPath: varchar("link_path", { length: 300 }),
    ...timestamps,
  },
  (t) => [index("notifications_tenant_user_idx").on(t.tenantId, t.userId)],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: id(),
    tenantId: tenantId(),
    actorUserId: char("actor_user_id", { length: 36 }).notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    /** Human-readable summary (Fassport-style Event.message). */
    message: varchar("message", { length: 500 }),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: char("entity_id", { length: 36 }).notNull(),
    meta: text("meta"),
    ...timestamps,
  },
  (t) => [
    index("audit_logs_tenant_idx").on(t.tenantId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
    index("audit_logs_actor_idx").on(t.actorUserId),
  ],
);

export const visitors = mysqlTable(
  "visitors",
  {
    id: id(),
    tenantId: tenantId(),
    flatId: char("flat_id", { length: 36 }).notNull(),
    visitorName: varchar("visitor_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 20 }),
    purpose: varchar("purpose", { length: 200 }),
    expectedAt: datetime("expected_at", { mode: "string", fsp: 3 }),
    checkedInAt: datetime("checked_in_at", { mode: "string", fsp: 3 }),
    checkedOutAt: datetime("checked_out_at", { mode: "string", fsp: 3 }),
    ...timestamps,
  },
  (t) => [index("visitors_tenant_flat_idx").on(t.tenantId, t.flatId)],
);

export const parkingSlots = mysqlTable(
  "parking_slots",
  {
    id: id(),
    tenantId: tenantId(),
    flatId: char("flat_id", { length: 36 }),
    slotNumber: varchar("slot_number", { length: 32 }).notNull(),
    vehicleNumber: varchar("vehicle_number", { length: 32 }),
    type: varchar("type", { length: 32 }).notNull().default("car"),
    ...timestamps,
  },
  (t) => [index("parking_slots_tenant_idx").on(t.tenantId)],
);

export const bookings = mysqlTable(
  "bookings",
  {
    id: id(),
    tenantId: tenantId(),
    facilityName: varchar("facility_name", { length: 120 }).notNull(),
    flatId: char("flat_id", { length: 36 }).notNull(),
    bookedByUserId: char("booked_by_user_id", { length: 36 }).notNull(),
    startAt: datetime("start_at", { mode: "string", fsp: 3 }).notNull(),
    endAt: datetime("end_at", { mode: "string", fsp: 3 }).notNull(),
    status: mysqlEnum("status", ["pending", "confirmed", "cancelled"])
      .notNull()
      .default("pending"),
    ...timestamps,
  },
  (t) => [index("bookings_tenant_idx").on(t.tenantId)],
);

export const assets = mysqlTable(
  "assets",
  {
    id: id(),
    tenantId: tenantId(),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 80 }),
    location: varchar("location", { length: 200 }),
    purchaseDate: datetime("purchase_date", { mode: "string", fsp: 3 }),
    value: int("value_paise"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("assets_tenant_idx").on(t.tenantId)],
);

export const vendors = mysqlTable(
  "vendors",
  {
    id: id(),
    tenantId: tenantId(),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 80 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 200 }),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("vendors_tenant_idx").on(t.tenantId)],
);

export const events = mysqlTable(
  "events",
  {
    id: id(),
    tenantId: tenantId(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    startAt: datetime("start_at", { mode: "string", fsp: 3 }),
    endAt: datetime("end_at", { mode: "string", fsp: 3 }),
    location: varchar("location", { length: 200 }),
    ...timestamps,
  },
  (t) => [index("events_tenant_idx").on(t.tenantId)],
);
