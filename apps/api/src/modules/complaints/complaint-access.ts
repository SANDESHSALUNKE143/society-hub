import type { ComplaintStatus, Role } from "@society-hub/types";
import { isStaffRole } from "../../lib/auth-helpers";

const LOCKED: ComplaintStatus[] = ["resolved", "closed"];

export function canResidentEditComplaint(input: {
  role: Role;
  userId: string;
  raisedByUserId: string;
  status: ComplaintStatus;
}): boolean {
  if (input.raisedByUserId !== input.userId) return false;
  return !LOCKED.includes(input.status);
}

export function canDeleteComplaint(input: {
  role: Role;
  userId: string;
  raisedByUserId: string;
  status: ComplaintStatus;
}): boolean {
  if (isStaffRole(input.role)) return true;
  return input.raisedByUserId === input.userId && input.status === "open";
}
