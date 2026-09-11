import { z } from "zod";
import { vehicleParkingQuotaMessage } from "@society-hub/types";

export const requestOtpSchema = z.object({
  phone: z.string().min(10).max(15),
});

export const verifyOtpSchema = z.object({
  phone: z.string().min(10).max(15),
  code: z.string().min(4).max(8),
});

export const setPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/),
});

export const loginPinSchema = z.object({
  phone: z.string().min(10).max(15),
  pin: z.string().regex(/^\d{4,6}$/),
});

export const loginPasswordSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(200),
});

export const resetPasswordSchema = z.object({
  email: z.string().email().max(200),
  code: z.string().min(4).max(8),
  newPassword: z.string().min(8).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(10),
});

export const selectTenantSchema = z.object({
  tenantId: z.string().uuid(),
});

export const residentTypeEnum = z.enum(["owner", "tenant", "family"]);
export const residentStatusEnum = z.enum([
  "invited",
  "pending_verification",
  "active",
  "suspended",
  "moved_out",
  "rejected",
]);
export const verificationStatusEnum = z.enum([
  "pending",
  "under_review",
  "approved",
  "rejected",
]);
export const residentDocumentTypeEnum = z.enum([
  "identity",
  "address_proof",
  "tenant_agreement",
  "police_verification",
  "other",
]);
export const familyRelationshipEnum = z.enum([
  "spouse",
  "child",
  "parent",
  "sibling",
  "other",
]);

export const residentVehicleKindEnum = z.enum(["two_wheeler", "four_wheeler"]);

export const residentVehicleSchema = z.object({
  kind: residentVehicleKindEnum,
  registrationNumber: z.preprocess(
    (v) => (v == null || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().min(4).max(32).nullable(),
  ),
  parkingPurchased: z.boolean().optional().default(false),
  parkingSlot: z.string().max(32).optional().nullable(),
});

function refineVehicleQuota(
  vehicles:
    | Array<{
        kind: "two_wheeler" | "four_wheeler";
        parkingPurchased?: boolean;
      }>
    | undefined,
  ctx: z.RefinementCtx,
) {
  if (!vehicles?.length) return;
  const message = vehicleParkingQuotaMessage(vehicles);
  if (message) {
    ctx.addIssue({ code: "custom", path: ["vehicles"], message });
  }
}

export const optionalFamilyCountSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(50)
  .optional();

export const onboardResidentSchema = z
  .object({
    name: z.string().min(1).max(120),
    phone: z.string().min(10).max(15),
    flatId: z.string().uuid(),
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? null : v),
      z.string().email().max(200).optional().nullable(),
    ),
    residentType: residentTypeEnum.optional().default("owner"),
    isPrimary: z.boolean().optional().default(true),
    moveInDate: z.string().max(40).optional().nullable(),
    remarks: z.string().max(500).optional().nullable(),
    floor: z.coerce.number().int().min(0).max(200).optional().nullable(),
    parkingSlot: z.string().max(32).optional().nullable(),
    parkingSlotId: z.string().uuid().optional().nullable(),
    isOwner: z.boolean().optional(),
    editOwner: z.boolean().optional(),
    editUserId: z.string().uuid().optional(),
    emergencyContact: z.string().max(40).optional().nullable(),
    vehicleNumber: z.string().max(32).optional().nullable(),
    vehicles: z.array(residentVehicleSchema).max(20).optional(),
    pngGasConnection: z.boolean().optional(),
    adultCount: optionalFamilyCountSchema,
    childCount: optionalFamilyCountSchema,
    seniorCitizenCount: optionalFamilyCountSchema,
    /** Welcome notify only — does not create an invitation row. */
    channels: z.array(z.enum(["email", "whatsapp"])).optional(),
  })
  .superRefine((val, ctx) => refineVehicleQuota(val.vehicles, ctx));

/** Admin-side resident directory query — server-side search/filter/sort/page. */
export const residentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Matches name, phone, email or flat number. */
  search: z.string().max(120).optional(),
  buildingId: z.string().uuid().optional(),
  wingId: z.string().uuid().optional(),
  flatId: z.string().uuid().optional(),
  residentType: residentTypeEnum.optional(),
  status: residentStatusEnum.optional(),
  verificationStatus: verificationStatusEnum.optional(),
  sort: z.enum(["name", "flat", "createdAt", "status"]).default("name"),
  order: z.enum(["asc", "desc"]).default("asc"),
});

/** Admin flat directory query — occupancy is derived and filterable in SQL. */
export const flatListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(64).optional(),
  buildingId: z.string().uuid().optional(),
  wingId: z.string().uuid().optional(),
  occupancy: z.enum(["vacant", "owner_occupied", "tenant_occupied"]).optional(),
});

export const updateResidentSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(10).max(15).optional(),
  email: z.string().email().max(200).optional().nullable(),
  residentType: residentTypeEnum.optional(),
  isPrimary: z.boolean().optional(),
  moveInDate: z.string().max(40).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
});

export const rejectResidentSchema = z.object({
  reason: z.string().min(3).max(500),
});

export const suspendResidentSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

export const moveOutResidentSchema = z.object({
  moveOutDate: z.string().max(40).optional().nullable(),
  reason: z.string().max(200).optional().nullable(),
  remarks: z.string().max(500).optional().nullable(),
});

export const createFamilyMemberSchema = z.object({
  name: z.string().min(1).max(120),
  relationship: familyRelationshipEnum.default("other"),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
});

export const updateFamilyMemberSchema = createFamilyMemberSchema.partial();

export const uploadDocumentMetaSchema = z.object({
  docType: residentDocumentTypeEnum.default("other"),
  documentNumber: z.string().max(64).optional().nullable(),
  expiresAt: z.string().max(40).optional().nullable(),
});

export const rejectDocumentSchema = z.object({
  reason: z.string().min(3).max(500),
});

export const addHouseholdMemberSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(10).max(15),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().email().max(200).optional().nullable(),
  ),
});

export const createComplaintSchema = z.object({
  title: z.string().min(3).max(200),
  type: z.enum([
    "electric",
    "plumbing",
    "housekeeping",
    "security",
    "lift",
    "other",
  ]),
  typeOtherText: z.string().max(120).optional().nullable(),
  description: z.string().min(3).max(5000),
  /** Required for staff/superadmin without a resident flat link. */
  flatId: z.string().uuid().optional().nullable(),
});

export const updateComplaintStatusSchema = z
  .object({
    status: z.enum(["open", "assigned", "in_progress", "resolved", "closed"]),
    assignedToUserId: z.string().uuid().optional().nullable(),
    note: z.string().max(2000).optional().nullable(),
  })
  .superRefine((val, ctx) => {
    if (
      (val.status === "resolved" || val.status === "closed") &&
      !(val.note && val.note.trim().length >= 3)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Add a short closing comment (at least 3 characters)",
      });
    }
  });

export const updateComplaintSchema = createComplaintSchema.omit({ flatId: true }).partial().refine(
  (val) =>
    val.title !== undefined ||
    val.type !== undefined ||
    val.description !== undefined ||
    val.typeOtherText !== undefined,
  { message: "Provide at least one field to update" },
);

export const createComplaintCommentSchema = z.object({
  body: z.string().min(1).max(2000),
  kind: z.enum(["comment", "question"]).optional().default("comment"),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** When true, staff/platform users only see rows they raised (Resident mode). */
  mine: z
    .preprocess(
      (v) => v === true || v === "true" || v === "1" || v === 1,
      z.boolean(),
    )
    .optional()
    .default(false),
});

const roleEnum = z.enum([
  "superadmin",
  "chairperson",
  "admin",
  "secretary",
  "treasurer",
  "cashier",
  "committee",
  "resident",
  "tenant",
]);

export const societyStaffRoleEnum = z.enum([
  "chairperson",
  "admin",
  "secretary",
  "treasurer",
  "cashier",
  "committee",
]);

export const addSocietyTeamMemberSchema = z.object({
  email: z.string().email().max(200).optional(),
  phone: z.string().min(10).max(15).optional(),
  name: z.string().min(1).max(120).optional(),
  role: societyStaffRoleEnum.default("chairperson"),
});

export const updateSocietyTeamMemberSchema = z
  .object({
    email: z.string().email().max(200).optional(),
    phone: z.string().min(10).max(15).optional(),
    name: z.string().min(1).max(120).optional(),
    role: societyStaffRoleEnum.optional(),
  })
  .refine((d) => d.email || d.phone || d.name || d.role, {
    message: "at least one field is required",
  });

export const createSocietySchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  pincode: z.string().max(12).optional().nullable(),
  timezone: z.string().max(64).default("Asia/Kolkata").optional(),
  chairpersonName: z.string().max(120).optional().nullable(),
  chairpersonEmail: z.string().email().max(200).optional().nullable(),
  chairpersonPhone: z.string().max(15).optional().nullable(),
  chairpersonPassword: z.string().min(8).max(128).optional(),
});

export const createBuildingSchema = z.object({
  name: z.string().min(1).max(120),
});

export const createWingSchema = z.object({
  name: z.string().min(1).max(120),
});

export const createFlatSchema = z.object({
  number: z.string().min(1).max(32),
  floor: z.number().int().min(0).max(200).optional().nullable(),
  parkingSlot: z.string().max(32).optional().nullable(),
  details: z.record(z.string(), z.string()).optional().nullable(),
});

/** Platform Manage: one flat identified by wing + floor + number (FR-ONB-3). */
export const createSocietyFlatSchema = z.object({
  wing: z.string().trim().min(1).max(120),
  floor: z.coerce.number().int().min(0).max(200),
  flatNumber: z.string().trim().min(1).max(32),
});

export const importSocietyFlatsSchema = z.object({
  rows: z.array(createSocietyFlatSchema).min(1).max(2000),
});

export const PARKING_KINDS = ["puzzle", "open"] as const;

/** Platform Manage: puzzle (wing + number) or open (number) — FR-ONB-3b. */
export const createSocietyParkingSchema = z
  .object({
    kind: z.enum(PARKING_KINDS),
    wing: z.string().trim().max(32).optional().nullable(),
    floor: z.coerce.number().int().min(0).max(200).optional().nullable(),
    slotNumber: z.string().trim().min(1).max(32),
  })
  .superRefine((val, ctx) => {
    if (val.kind !== "puzzle") return;
    if (!val.wing) {
      ctx.addIssue({
        code: "custom",
        path: ["wing"],
        message: "Wing is required for puzzle parking",
      });
    }
  });

export const importSocietyParkingsSchema = z.object({
  rows: z.array(createSocietyParkingSchema).min(1).max(2000),
});

export const residentImportRowSchema = z
  .object({
    name: z.string().min(1).max(120),
    phone: z.string().min(10).max(15),
    email: z.string().email().max(200).optional().nullable(),
    flatNumber: z.string().min(1).max(32),
    wingName: z.string().min(1).max(120).optional().nullable(),
    floor: z.coerce.number().int().min(0).max(200).optional().nullable(),
    parkingSlot: z.string().max(32).optional().nullable(),
    isOwner: z.boolean().optional().default(true),
    residentType: residentTypeEnum.optional(),
    emergencyContact: z.string().max(40).optional().nullable(),
    vehicleNumber: z.string().max(32).optional().nullable(),
    vehicles: z.array(residentVehicleSchema).max(20).optional(),
    pngGasConnection: z.boolean().optional(),
    adultCount: optionalFamilyCountSchema,
    childCount: optionalFamilyCountSchema,
    seniorCitizenCount: optionalFamilyCountSchema,
    sendInvite: z.boolean().optional().default(false),
  })
  .superRefine((val, ctx) => refineVehicleQuota(val.vehicles, ctx));

export const residentImportSchema = z.object({
  rows: z.array(residentImportRowSchema).min(1).max(500),
  /** Send invite for newly created residents (and forceInvite updates). */
  sendInvites: z.boolean().optional().default(false),
  /** Re-send invites even when the resident already exists. */
  forceInvite: z.boolean().optional().default(false),
  /** Update floor / parking on matched flats from CSV columns. */
  updateFlats: z.boolean().optional().default(true),
  /** Create flat under an existing wing when flatNumber is missing. */
  createMissingFlats: z.boolean().optional().default(false),
  /**
   * Import the valid rows even when others fail validation. Off by default so
   * a bad file is rejected whole rather than half-applied.
   */
  allowPartial: z.boolean().optional().default(false),
});

export const createInvitationSchema = z.object({
  name: z.string().max(120).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  phone: z.string().max(15).optional().nullable(),
  role: roleEnum.default("resident"),
  flatId: z.string().uuid().optional().nullable(),
  residentType: residentTypeEnum.optional().nullable(),
  /** Days until the invite expires; defaults to 14. */
  expiresInDays: z.coerce.number().int().min(1).max(90).optional().default(14),
  channels: z
    .array(z.enum(["email", "whatsapp"]))
    .optional()
    .default(["email"]),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(8).max(128),
  name: z.string().min(1).max(120).optional(),
  /** Required when the invite carries no phone (OTP identity is phone-based). */
  phone: z.string().min(10).max(15).optional(),
  email: z.string().email().max(200).optional().nullable(),
});

export const invitationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(120).optional(),
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
  role: roleEnum.optional(),
});

const communicationPreferencesSchema = z.object({
  inApp: z.boolean().optional(),
  push: z.boolean().optional(),
  email: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  sms: z.boolean().optional(),
});

/**
 * Self-service profile edit. Deliberately excludes flat, resident type,
 * membership status and verification status — those require an Admin.
 */
export const updateResidentProfileSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    emergencyContact: z.string().max(40).optional().nullable(),
    emergencyContactName: z.string().max(120).optional().nullable(),
    emergencyContactRelation: z.string().max(40).optional().nullable(),
    emergencyContactPhone: z.string().max(20).optional().nullable(),
    vehicleNumber: z.string().max(32).optional().nullable(),
    communicationPreferences: communicationPreferencesSchema.optional(),
    vehicles: z.array(residentVehicleSchema).max(20).optional(),
    pngGasConnection: z.boolean().optional(),
    adultCount: optionalFamilyCountSchema,
    childCount: optionalFamilyCountSchema,
    seniorCitizenCount: optionalFamilyCountSchema,
    parkingSlot: z.string().max(32).optional().nullable(),
    parkingSlotId: z.string().uuid().optional().nullable(),
  })
  .superRefine((val, ctx) => refineVehicleQuota(val.vehicles, ctx));

/** Society-admin team management (distinct from the platform-only Manage flow). */
export const addTeamMemberSchema = z
  .object({
    userId: z.string().uuid().optional(),
    name: z.string().min(1).max(120).optional(),
    email: z.string().email().max(200).optional().nullable(),
    phone: z.string().min(10).max(15).optional().nullable(),
    role: societyStaffRoleEnum,
  })
  .superRefine((val, ctx) => {
    if (!val.userId && !val.email && !val.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Provide a userId, an email or a phone",
      });
    }
  });

export const changeTeamRoleSchema = z.object({
  fromRole: societyStaffRoleEnum,
  toRole: societyStaffRoleEnum,
});

export const generateBillsSchema = z.object({
  periodYm: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM"),
  amountPaise: z.number().int().min(1),
  /** Short charge label shown on the bill (e.g. Monthly maintenance). */
  reason: z.string().trim().min(1).max(200),
  notes: z.string().max(1000).optional().nullable(),
  /** When omitted or empty, bills are generated for every flat in the society. */
  flatIds: z.array(z.string().uuid()).optional(),
});

export const voidBillSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
});

export const recordPaymentSchema = z.object({
  billId: z.string().uuid().optional().nullable(),
  flatId: z.string().uuid(),
  amountPaise: z.number().int().min(1),
  method: z.enum(["razorpay", "cash", "cheque", "neft", "upi"]),
  receiptNumber: z.string().max(64).optional().nullable(),
});

export const updatePaymentAccountSchema = z.object({
  upiId: z.string().max(80).optional().nullable(),
  accountName: z.string().max(120).optional().nullable(),
  accountNumber: z.string().max(40).optional().nullable(),
  ifsc: z.string().max(20).optional().nullable(),
});

export const reviewPaymentSchema = z.object({
  note: z.string().max(500).optional().nullable(),
});

export const razorpayWebhookSchema = z.object({
  orderId: z.string().min(1),
  paymentId: z.string().min(1),
  status: z.enum(["success", "failed"]).default("success"),
});

export const createNoticeSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  audience: z.enum(["all", "wing", "flat"]).default("all"),
  wingId: z.string().uuid().optional().nullable(),
  flatId: z.string().uuid().optional().nullable(),
  publishNow: z.boolean().optional(),
});

export const updateNoticeSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
});

/** Notices list — server-side search / sort / page. */
export const noticeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Matches title or body. */
  search: z.string().max(120).optional(),
  /** Staff only: filter by publish state. Residents always see published. */
  status: z.enum(["published", "draft"]).optional(),
  sort: z.enum(["createdAt", "publishedAt", "title"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export const createVisitorSchema = z.object({
  flatId: z.string().uuid().optional(),
  visitorName: z.string().min(1).max(120),
  phone: z.string().max(20).optional().nullable(),
  purpose: z.string().max(200).optional().nullable(),
  expectedAt: z.string().optional().nullable(),
});

export const createParkingSlotSchema = z.object({
  flatId: z.string().uuid().optional().nullable(),
  slotNumber: z.string().min(1).max(32),
  vehicleNumber: z.string().max(32).optional().nullable(),
  type: z.string().max(32).default("car").optional(),
});

export const createBookingSchema = z.object({
  facilityName: z.string().min(1).max(120),
  flatId: z.string().uuid().optional(),
  startAt: z.string(),
  endAt: z.string(),
});

export const createAssetSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(80).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  value: z.number().int().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const createVendorSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(80).optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable(),
  location: z.string().max(200).optional().nullable(),
});
