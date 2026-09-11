import type {
  FlatOccupancyStatus,
  ResidentStatus,
  ResidentType,
  VerificationStatus,
} from "@society-hub/types";
import { AppError } from "./errors";

/**
 * Membership statuses that mean "this person currently occupies the flat".
 * `active_key` is `'Y'` for exactly these, which is what makes the partial
 * unique index (`tenant_id, user_id, flat_id, active_key`) work.
 */
export const OCCUPYING_STATUSES: ResidentStatus[] = [
  "invited",
  "pending_verification",
  "active",
  "suspended",
];

export function isOccupying(status: ResidentStatus) {
  return OCCUPYING_STATUSES.includes(status);
}

/** `'Y'` while the membership occupies the flat, NULL once it does not. */
export function activeKeyFor(status: ResidentStatus): "Y" | null {
  return isOccupying(status) ? "Y" : null;
}

/**
 * Legal lifecycle transitions. Anything not listed is rejected with 409 so a
 * double-clicked Approve or a stale tab cannot corrupt the record.
 */
const TRANSITIONS: Record<ResidentStatus, ResidentStatus[]> = {
  invited: ["pending_verification", "active", "rejected", "moved_out"],
  pending_verification: ["active", "rejected", "suspended", "moved_out"],
  // An active resident can still be rejected — verification is reviewable at
  // any time, e.g. when a document turns out to be invalid after approval.
  active: ["suspended", "moved_out", "pending_verification", "rejected"],
  suspended: ["active", "moved_out", "rejected"],
  moved_out: [],
  rejected: ["pending_verification", "active"],
};

export function canTransition(from: ResidentStatus, to: ResidentStatus) {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ResidentStatus, to: ResidentStatus) {
  if (from === to) {
    throw new AppError(
      409,
      "invalid_transition",
      `Resident is already ${to.replace(/_/g, " ")}`,
    );
  }
  if (!canTransition(from, to)) {
    throw new AppError(
      409,
      "invalid_transition",
      `Cannot move a ${from.replace(/_/g, " ")} resident to ${to.replace(/_/g, " ")}`,
    );
  }
}

/** `is_owner` stays in the schema for existing callers; keep it in step. */
export function isOwnerFor(residentType: ResidentType) {
  return residentType === "owner";
}

/**
 * Occupancy is derived from live memberships, never stored. A flat counts as
 * tenant-occupied as soon as any tenant lives there — that is the fact an admin
 * cares about even when the owner also occupies part of the flat.
 */
export function deriveOccupancy(
  occupants: Array<{ residentType: ResidentType }>,
): FlatOccupancyStatus {
  if (occupants.length === 0) return "vacant";
  if (occupants.some((o) => o.residentType === "tenant")) {
    return "tenant_occupied";
  }
  return "owner_occupied";
}

/** Verification outcome drives the membership status shown to the resident. */
export function statusAfterVerification(
  current: ResidentStatus,
  outcome: VerificationStatus,
): ResidentStatus {
  if (outcome === "approved") return "active";
  if (outcome === "rejected") return "rejected";
  return current === "invited" ? "pending_verification" : current;
}

/** MySQL DATETIME(3) literal in UTC — matches the convention used elsewhere. */
export function toMysqlDateTime(value?: string | Date | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, "invalid_date", "Invalid date");
  }
  return date.toISOString().replace("T", " ").replace("Z", "");
}
