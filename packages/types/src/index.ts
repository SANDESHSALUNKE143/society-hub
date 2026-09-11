export type Role =
  | "superadmin"
  | "chairperson"
  /** @deprecated Use chairperson — kept for DB/JWT backward compatibility */
  | "admin"
  | "secretary"
  | "treasurer"
  | "cashier"
  | "committee"
  | "resident"
  | "tenant";

export type ComplaintStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

export type ComplaintType =
  | "electric"
  | "plumbing"
  | "housekeeping"
  | "security"
  | "lift"
  | "other";

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type UserDto = {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  username: string | null;
  role: Role;
  tenantId: string;
  flatId: string | null;
  flatNumber: string | null;
  hasPin: boolean;
};

export type ComplaintCommentKind = "comment" | "question";

export type ComplaintCommentDto = {
  id: string;
  complaintId: string;
  userId: string;
  authorName: string | null;
  body: string;
  kind: ComplaintCommentKind;
  createdAt: string;
};

export type ComplaintStatusEventDto = {
  id: string;
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};

export type ComplaintDto = {
  id: string;
  ticketNumber: string;
  title: string;
  type: ComplaintType;
  typeOtherText: string | null;
  description: string;
  status: ComplaintStatus;
  flatId: string;
  flatNumber: string;
  residentName: string | null;
  assignedToUserId: string | null;
  slaDueAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 1-based position among open/acknowledged tickets (null when not in queue). */
  queuePosition: number | null;
  /** How many tickets are ahead in the open queue. */
  openAheadCount: number | null;
  /** Friendly wait hint for residents (e.g. "About 2 tickets ahead"). */
  queueHint: string | null;
  attachments: ComplaintAttachmentDto[];
  comments: ComplaintCommentDto[];
  statusEvents: ComplaintStatusEventDto[];
  /** Latest resolve/close note from staff, if any. */
  closingNote: string | null;
};

export type ComplaintAttachmentDto = {
  id: string;
  contentKind: "image" | "video";
  contentType: string;
  url: string;
  byteSize: number;
};

export type FlatDto = {
  id: string;
  number: string;
  wingName: string | null;
  wingId?: string;
  floor?: number | null;
  parkingSlot?: string | null;
  pngGasConnection?: boolean;
  twoWheelerCount?: number;
  fourWheelerCount?: number;
  adultCount?: number;
  childCount?: number;
  seniorCitizenCount?: number;
  details?: Record<string, string> | null;
};

/** Included parking per flat until society settings override this (FR-ONB-7). */
export const INCLUDED_TWO_WHEELER_PARKING = 2;
export const INCLUDED_FOUR_WHEELER_PARKING = 1;

export type ResidentVehicleKind = "two_wheeler" | "four_wheeler";

export type ResidentVehicleDto = {
  kind: ResidentVehicleKind;
  registrationNumber: string | null;
  parkingPurchased: boolean;
  parkingSlot: string | null;
};

/** Expand a CSV/API count into vehicle rows (no plates). Extras are purchased. */
export function vehiclesFromKindCount(
  kind: ResidentVehicleKind,
  count: number,
): Array<{
  kind: ResidentVehicleKind;
  registrationNumber: null;
  parkingPurchased: boolean;
}> {
  const n = Math.max(0, Math.floor(count));
  const included =
    kind === "two_wheeler"
      ? INCLUDED_TWO_WHEELER_PARKING
      : INCLUDED_FOUR_WHEELER_PARKING;
  return Array.from({ length: n }, (_, i) => ({
    kind,
    registrationNumber: null,
    parkingPurchased: i >= included,
  }));
}

export function vehicleParkingQuotaMessage(
  vehicles: Array<{
    kind: ResidentVehicleKind;
    parkingPurchased?: boolean;
  }>,
): string | null {
  const two = vehicles.filter((v) => v.kind === "two_wheeler");
  const four = vehicles.filter((v) => v.kind === "four_wheeler");
  for (let i = 0; i < two.length; i++) {
    if (i >= INCLUDED_TWO_WHEELER_PARKING && !two[i]!.parkingPurchased) {
      return `Two-wheeler ${i + 1} needs purchased parking (first ${INCLUDED_TWO_WHEELER_PARKING} included)`;
    }
  }
  for (let i = 0; i < four.length; i++) {
    if (i >= INCLUDED_FOUR_WHEELER_PARKING && !four[i]!.parkingPurchased) {
      return `Four-wheeler ${i + 1} needs purchased parking (first ${INCLUDED_FOUR_WHEELER_PARKING} included)`;
    }
  }
  return null;
}

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};

export type MembershipDto = {
  tenantId: string;
  societyName: string;
  role: Role;
  canUseAdminMode: boolean;
};

export type SocietyDto = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  pincode: string | null;
  chairpersonName: string | null;
  chairpersonEmail: string | null;
  chairpersonPhone: string | null;
  timezone: string;
  createdAt: string;
};

export type BuildingDto = {
  id: string;
  name: string;
  wingCount?: number;
};

export type WingDto = {
  id: string;
  name: string;
  buildingId: string;
  flatCount?: number;
};

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type InvitationDto = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
  status: InvitationStatus;
  flatId: string | null;
  flatNumber: string | null;
  residentType: ResidentType | null;
  expiresAt: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastSentAt: string | null;
  resendCount: number;
  createdAt: string;
  /** Only present in DEV_AUTH so testers can accept without email/SMS delivery. */
  devToken?: string;
  delivery?: {
    email?: { ok: boolean; error?: string };
    whatsapp?: { ok: boolean; error?: string };
  };
};

/** Owner / tenant / household family member, per society membership. */
export type ResidentType = "owner" | "tenant" | "family";

/** Membership lifecycle. See docs/implementation/phase-1-domain.md. */
export type ResidentStatus =
  | "invited"
  | "pending_verification"
  | "active"
  | "suspended"
  | "moved_out"
  | "rejected";

export type VerificationStatus =
  | "pending"
  | "under_review"
  | "approved"
  | "rejected";

export type ResidentDocumentType =
  | "identity"
  | "address_proof"
  | "tenant_agreement"
  | "police_verification"
  | "other";

export type FamilyRelationship =
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "other";

/** Derived from active memberships — never stored on `flats`. */
export type FlatOccupancyStatus = "vacant" | "owner_occupied" | "tenant_occupied";

export type CommunicationPreferences = {
  inApp: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
};

export type ResidentFlatSummaryDto = {
  id: string;
  number: string;
  wingId: string | null;
  wingName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  floor: number | null;
  parkingSlot: string | null;
};

/** One row of the Admin resident directory. */
export type ResidentSummaryDto = {
  /** `residents.id` — the membership id, not the user id. */
  id: string;
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  residentType: ResidentType;
  isPrimary: boolean;
  status: ResidentStatus;
  verificationStatus: VerificationStatus;
  moveInDate: string | null;
  moveOutDate: string | null;
  flat: ResidentFlatSummaryDto | null;
  createdAt: string;
};

export type ResidentFamilyMemberDto = {
  id: string;
  residentId: string;
  name: string;
  relationship: FamilyRelationship;
  phone: string | null;
  email: string | null;
  linkedUserId: string | null;
  createdAt: string;
};

export type ResidentDocumentDto = {
  id: string;
  residentId: string;
  docType: ResidentDocumentType;
  documentNumber: string | null;
  fileName: string;
  contentType: string;
  byteSize: number | null;
  status: VerificationStatus;
  rejectionReason: string | null;
  expiresAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  uploadedAt: string;
  /** Authenticated, tenant-scoped download path — never a public blob URL. */
  downloadPath: string;
};

export type ResidentDetailDto = ResidentSummaryDto & {
  societyName: string | null;
  remarks: string | null;
  moveOutReason: string | null;
  rejectionReason: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  roles: Role[];
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  vehicleNumber: string | null;
  communicationPreferences: CommunicationPreferences;
  family: ResidentFamilyMemberDto[];
  documents: ResidentDocumentDto[];
  vehicles: ResidentVehicleDto[];
  /** Other memberships of the same person in this society (past and present). */
  otherMemberships: ResidentSummaryDto[];
};

export type FlatOccupantDto = {
  residentId: string;
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  residentType: ResidentType;
  isPrimary: boolean;
  status: ResidentStatus;
  verificationStatus: VerificationStatus;
  moveInDate: string | null;
  moveOutDate: string | null;
  familyCount: number;
};

export type FlatDetailDto = {
  id: string;
  number: string;
  wingId: string | null;
  wingName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  floor: number | null;
  parkingSlot: string | null;
  details: Record<string, string> | null;
  occupancyStatus: FlatOccupancyStatus;
  primaryOwner: FlatOccupantDto | null;
  coOwners: FlatOccupantDto[];
  tenants: FlatOccupantDto[];
  currentOccupants: FlatOccupantDto[];
  vehicles: ResidentVehicleDto[];
  documentCount: number;
};

/** A closed or open occupancy period on a flat, newest first. */
export type FlatOccupancyHistoryEntryDto = {
  residentId: string;
  userId: string;
  name: string | null;
  residentType: ResidentType;
  status: ResidentStatus;
  moveInDate: string | null;
  moveOutDate: string | null;
  moveOutReason: string | null;
  isCurrent: boolean;
};

/** One row of the Admin flat directory. */
export type FlatOccupancySummaryDto = {
  id: string;
  number: string;
  wingId: string | null;
  wingName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  floor: number | null;
  parkingSlot: string | null;
  occupantCount: number;
  occupancyStatus: FlatOccupancyStatus;
};

export type OccupancyStatsDto = {
  totalFlats: number;
  occupiedFlats: number;
  vacantFlats: number;
  ownerOccupiedFlats: number;
  tenantOccupiedFlats: number;
  totalResidents: number;
  activeResidents: number;
  pendingVerification: number;
  pendingInvitations: number;
  movedOut: number;
};

export type ResidentProfileDto = {
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** @deprecated Legacy free-text field; prefer the structured fields below. */
  emergencyContact: string | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  vehicleNumber: string | null;
  communicationPreferences: CommunicationPreferences;
  vehicles: ResidentVehicleDto[];
  societyName: string | null;
  /** The signed-in user's active membership in the current society. */
  membership: {
    id: string;
    residentType: ResidentType;
    isPrimary: boolean;
    status: ResidentStatus;
    verificationStatus: VerificationStatus;
    rejectionReason: string | null;
    moveInDate: string | null;
    moveOutDate: string | null;
  } | null;
  family: ResidentFamilyMemberDto[];
  documents: ResidentDocumentDto[];
  flat: {
    id: string;
    number: string;
    wingName: string | null;
    buildingName: string | null;
    floor: number | null;
    parkingSlot: string | null;
    pngGasConnection: boolean;
    adultCount: number;
    childCount: number;
    seniorCitizenCount: number;
    twoWheelerCount: number;
    fourWheelerCount: number;
    isOwner: boolean;
  } | null;
};

export type PaymentMethod = "razorpay" | "cash" | "cheque" | "neft" | "upi";
export type PaymentStatus = "pending" | "success" | "failed";

export type PaymentAccountDto = {
  upiId: string | null;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  qrUrl: string | null;
};

export type PaymentDto = {
  id: string;
  billId: string | null;
  flatId: string;
  flatNumber: string | null;
  amountPaise: number;
  method: PaymentMethod;
  status: PaymentStatus;
  receiptNumber: string | null;
  proofUrl: string | null;
  reviewNote: string | null;
  createdAt: string;
};

export type BillStatus = "draft" | "issued" | "paid" | "void" | "corrected";

export type BillLineItemDto = {
  id: string;
  label: string;
  amountPaise: number;
};

/** Current flat resident shown on bill detail (owner / occupants). */
export type BillResidentDto = {
  userId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  residentType: ResidentType;
  isPrimary: boolean;
};

export type BillDto = {
  id: string;
  flatId: string;
  flatNumber: string;
  periodYm: string;
  amountPaise: number;
  status: BillStatus;
  notes: string | null;
  createdAt: string;
  /** Present on `GET /v1/bills/:id` — charge breakdown for this bill. */
  lineItems?: BillLineItemDto[];
  /** Present on `GET /v1/bills/:id` — payments linked to this bill. */
  payments?: PaymentDto[];
  /** Present on `GET /v1/bills/:id` — primary owner of the flat, if any. */
  owner?: BillResidentDto | null;
  /** Present on `GET /v1/bills/:id` — other current occupants (excludes owner). */
  occupants?: BillResidentDto[];
};

export type ReceiptDto = {
  receiptNumber: string;
  paymentId: string;
  flatNumber: string;
  amountPaise: number;
  method: PaymentMethod;
  paidAt: string;
};

export type NoticeAudience = "all" | "wing" | "flat";

export type NoticeAttachmentDto = {
  id: string;
  contentKind: "image" | "video";
  contentType: string;
  url: string;
  byteSize: number;
};

export type NoticeDto = {
  id: string;
  title: string;
  body: string;
  audience: NoticeAudience;
  wingId: string | null;
  flatId: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  createdAt: string;
  attachments: NoticeAttachmentDto[];
};

export type NotificationDto = {
  id: string;
  title: string;
  body: string;
  kind: string;
  readAt: string | null;
  linkPath: string | null;
  createdAt: string;
};

export type AuditLogDto = {
  id: string;
  actorUserId: string;
  actorName: string | null;
  action: string;
  message?: string | null;
  entityType: string;
  entityId: string;
  meta: string | null;
  createdAt: string;
};

/** Fassport-style activity event (platform / entity history). */
export type ActivityEventDto = {
  id: string;
  tenantId: string;
  societyName: string | null;
  actorUserId: string;
  actorName: string | null;
  action: string;
  message: string | null;
  entityType: string;
  entityId: string;
  meta: string | null;
  createdAt: string;
};

export type PlatformUserMembershipDto = {
  tenantId: string;
  societyName: string;
  role: Role;
};

export type PlatformUserDto = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  username: string | null;
  memberships: PlatformUserMembershipDto[];
  createdAt: string;
  lastActivityAt: string | null;
};

export type ResidentImportRowError = {
  row: number;
  /** Flat number from the offending row, when it could be read. */
  flatNumber?: string | null;
  field?: string | null;
  message: string;
};

export type ResidentImportResultDto = {
  total: number;
  created: number;
  updated: number;
  invited: number;
  skipped: number;
  unchanged: number;
  errors: ResidentImportRowError[];
};

export type ResidentImportPreviewRowDto = {
  row: number;
  name: string;
  phone: string;
  email: string | null;
  flatNumber: string;
  wingName: string | null;
  residentType: ResidentType;
  /** What the import will do to this row if confirmed. */
  action: "create" | "update" | "unchanged" | "skip";
  flatExists: boolean;
  errors: string[];
  warnings: string[];
};

export type ResidentImportPreviewDto = {
  total: number;
  valid: number;
  invalid: number;
  willCreate: number;
  willUpdate: number;
  willSkip: number;
  unchanged: number;
  rows: ResidentImportPreviewRowDto[];
};

export type SocietyFlatInput = {
  wing: string;
  floor: number;
  flatNumber: string;
};

export type ParkingKind = "puzzle" | "open";

export type SocietyParkingInput = {
  kind: ParkingKind;
  wing: string | null;
  floor: number | null;
  slotNumber: string;
};

export type SocietyFlatImportResultDto = {
  created: number;
  updated: number;
  skipped: number;
  errors: ResidentImportRowError[];
};

export type TeamMemberDto = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: Role;
};

export type SocietyResidentDto = {
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  flatId: string;
  flatNumber: string;
  wingName: string | null;
  isOwner: boolean;
};

export type VisitorDto = {
  id: string;
  flatId: string;
  flatNumber: string | null;
  visitorName: string;
  phone: string | null;
  purpose: string | null;
  expectedAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  createdAt: string;
};

export type ParkingSlotDto = {
  id: string;
  flatId: string | null;
  flatNumber: string | null;
  slotNumber: string;
  vehicleNumber: string | null;
  type: string;
  kind: ParkingKind;
  wing: string | null;
  floor: number | null;
  createdAt: string;
};

export type BookingStatus = "pending" | "confirmed" | "cancelled";

export type BookingDto = {
  id: string;
  facilityName: string;
  flatId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  createdAt: string;
};

export type AssetDto = {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  purchaseDate: string | null;
  value: number | null;
  notes: string | null;
  createdAt: string;
};

export type VendorDto = {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
};

export type EventDto = {
  id: string;
  title: string;
  description: string | null;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  createdAt: string;
};

export type DashboardStatsDto = {
  openComplaints: number;
  totalComplaints: number;
  duesOutstandingPaise: number;
  upcomingBookings: number;
  publishedNotices: number;
  unreadNotifications: number;
  /** Society-wide occupancy roll-up; null in Resident mode. */
  occupancy: OccupancyStatsDto | null;
};
