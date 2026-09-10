import type { ComplaintStatus, ComplaintType } from "@society-hub/types";

export const TYPE_LABELS: Record<ComplaintType, string> = {
  electric: "Electric",
  plumbing: "Plumbing",
  housekeeping: "Housekeeping",
  security: "Security",
  lift: "Lift",
  other: "Other",
};

/** Friendly labels — "assigned" is how admins acknowledge without starting work. */
export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: "In queue",
  assigned: "Acknowledged",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export function statusBadgeClass(status: ComplaintStatus) {
  if (status === "resolved" || status === "closed") return "badge badge-success";
  if (status === "open") return "badge badge-danger";
  if (status === "in_progress") return "badge badge-progress";
  if (status === "assigned") return "badge";
  return "badge";
}

export function statusTone(status: ComplaintStatus): "open" | "progress" | "ok" | "ack" {
  if (status === "open") return "open";
  if (status === "in_progress") return "progress";
  if (status === "resolved" || status === "closed") return "ok";
  return "ack";
}
