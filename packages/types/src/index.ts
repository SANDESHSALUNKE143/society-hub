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

export type ComplaintCommentDto = {
  id: string;
  complaintId: string;
  userId: string;
  authorName: string | null;
  body: string;
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

export type InvitationStatus = "pending" | "accepted" | "revoked";

export type InvitationDto = {
  id: string;
  email: string | null;
  phone: string | null;
  role: Role;
  status: InvitationStatus;
  createdAt: string;
  /** Only present in DEV_AUTH so testers can accept without email/SMS delivery. */
  devToken?: string;
  delivery?: {
    email?: { ok: boolean; error?: string };
    whatsapp?: { ok: boolean; error?: string };
  };
};

export type ResidentProfileDto = {
  userId: string;
  emergencyContact: string | null;
  vehicleNumber: string | null;
  vehicles: ResidentVehicleDto[];
  societyName: string | null;
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

export type BillStatus = "draft" | "issued" | "paid" | "void" | "corrected";

export type BillDto = {
  id: string;
  flatId: string;
  flatNumber: string;
  periodYm: string;
  amountPaise: number;
  status: BillStatus;
  notes: string | null;
  createdAt: string;
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

export type ReceiptDto = {
  receiptNumber: string;
  paymentId: string;
  flatNumber: string;
  amountPaise: number;
  method: PaymentMethod;
  paidAt: string;
};

export type NoticeAudience = "all" | "wing" | "flat";

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
  message: string;
};

export type ResidentImportResultDto = {
  created: number;
  updated: number;
  invited: number;
  skipped: number;
  unchanged: number;
  errors: ResidentImportRowError[];
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
};
