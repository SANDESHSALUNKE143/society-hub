import type {
  FamilyRelationship,
  FlatOccupancyStatus,
  InvitationStatus,
  ResidentDocumentType,
  ResidentStatus,
  ResidentType,
  VerificationStatus,
} from "@society-hub/types";

export const RESIDENT_TYPE_LABELS: Record<ResidentType, string> = {
  owner: "Owner",
  tenant: "Tenant",
  family: "Family member",
};

export const RESIDENT_STATUS_LABELS: Record<ResidentStatus, string> = {
  invited: "Invited",
  pending_verification: "Pending verification",
  active: "Active",
  suspended: "Suspended",
  moved_out: "Moved out",
  rejected: "Rejected",
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "Pending",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
};

export const DOCUMENT_TYPE_LABELS: Record<ResidentDocumentType, string> = {
  identity: "Identity",
  address_proof: "Address proof",
  tenant_agreement: "Tenant agreement",
  police_verification: "Police verification",
  other: "Other",
};

export const RELATIONSHIP_LABELS: Record<FamilyRelationship, string> = {
  spouse: "Spouse",
  child: "Child",
  parent: "Parent",
  sibling: "Sibling",
  other: "Other",
};

export const OCCUPANCY_LABELS: Record<FlatOccupancyStatus, string> = {
  vacant: "Vacant",
  owner_occupied: "Owner occupied",
  tenant_occupied: "Tenant occupied",
};

export const INVITATION_STATUS_LABELS: Record<InvitationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};

/** Maps a lifecycle state onto the three badge styles the design system has. */
export function residentStatusBadgeClass(status: ResidentStatus) {
  if (status === "active") return "badge badge-success";
  if (status === "rejected" || status === "suspended") return "badge badge-danger";
  return "badge";
}

export function verificationBadgeClass(status: VerificationStatus) {
  if (status === "approved") return "badge badge-success";
  if (status === "rejected") return "badge badge-danger";
  return "badge";
}

export function invitationBadgeClass(status: InvitationStatus) {
  if (status === "accepted") return "badge badge-success";
  if (status === "revoked" || status === "expired") return "badge badge-danger";
  return "badge";
}

export function occupancyBadgeClass(status: FlatOccupancyStatus) {
  if (status === "vacant") return "badge";
  if (status === "tenant_occupied") return "badge badge-danger";
  return "badge badge-success";
}

/** "A-1204" when a wing is known, otherwise just the flat number. */
export function flatLabel(
  flat: { number: string; wingName?: string | null } | null | undefined,
) {
  if (!flat) return "—";
  return flat.wingName ? `${flat.wingName}-${flat.number}` : flat.number;
}

/** Renders an occupancy period as "2023-01-01 → Present". */
export function occupancyPeriod(
  moveInDate: string | null,
  moveOutDate: string | null,
) {
  const from = moveInDate ? moveInDate.slice(0, 10) : "—";
  const to = moveOutDate ? moveOutDate.slice(0, 10) : "Present";
  return `${from} → ${to}`;
}
