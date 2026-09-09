import type { ComplaintType } from "@society-hub/types";

function parsedDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatComplaintWhen(iso: string | null | undefined): string {
  const date = parsedDate(iso);
  if (!date) return "";
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${day}, ${time}`;
}

export function formatComplaintRaised(iso: string | null | undefined): string {
  const date = parsedDate(iso);
  if (!date) return "";
  const today = new Date();
  const startOf = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = startOf(today) - startOf(date);
  if (diff === 0) return "today";
  if (diff === 86_400_000) return "yesterday";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatComplaintTimelineWhen(iso: string | null | undefined): string {
  const date = parsedDate(iso);
  if (!date) return "";
  const raised = formatComplaintRaised(iso);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  if (raised === "today") return `Today, ${time}`;
  if (raised === "yesterday") return `Yesterday, ${time}`;
  return `${formatComplaintWhen(iso)}`;
}

export function timelineEventTitle(
  fromStatus: string | null | undefined,
  toStatus: string,
  labels: Record<string, string>,
): string {
  if (!fromStatus) return "Submitted";
  return labels[toStatus] ?? toStatus;
}

export function timelineEventIcon(
  toStatus: string,
): "send" | "check" | "work" | "done" {
  if (toStatus === "assigned") return "check";
  if (toStatus === "in_progress") return "work";
  if (toStatus === "resolved" || toStatus === "closed") return "done";
  return "send";
}

export function complaintFlatLabel(flatNumber: string | null | undefined): string {
  const number = flatNumber?.trim();
  return number ? `Flat ${number}` : "";
}

export function complaintQueueLine(input: {
  status: string;
  queuePosition?: number | null;
  queueHint?: string | null;
}): string {
  if (input.status !== "open") return "";
  const hint = input.queueHint?.trim();
  if (hint) return hint;
  if (input.queuePosition != null) return `Queue #${input.queuePosition}`;
  return "";
}

export function complaintTypeIconName(type: ComplaintType | string): ComplaintType {
  if (
    type === "electric" ||
    type === "plumbing" ||
    type === "housekeeping" ||
    type === "security" ||
    type === "lift" ||
    type === "other"
  ) {
    return type;
  }
  return "other";
}
