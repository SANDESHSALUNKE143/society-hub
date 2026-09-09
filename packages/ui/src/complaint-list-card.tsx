import type { ReactNode } from "react";
import type { ComplaintStatus, ComplaintType } from "@society-hub/types";
import { ComplaintStatusPill } from "./complaint-detail";
import { ComplaintTypeIcon } from "./complaint-type-icon";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function WebGlyph({
  children,
  size,
  className,
}: {
  children: ReactNode;
  size: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

export function ComplaintListCard({
  type,
  title,
  location,
  when,
  ticketNumber,
  status,
  queueLine,
  className,
}: {
  type: ComplaintType | string;
  title: string;
  location?: string;
  when?: string;
  ticketNumber: string;
  status: ComplaintStatus;
  queueLine?: string;
  className?: string;
}) {
  return (
    <div className={cx("sh-complaint-card", className)}>
      <span className="sh-complaint-icon">
        <ComplaintTypeIcon type={type} size={22} />
      </span>
      <div className="sh-complaint-body">
        <p className="sh-complaint-title">{title}</p>
        {location ? <p className="sh-complaint-location">{location}</p> : null}
        {when ? (
          <p className="sh-complaint-meta">
            <WebGlyph size={13}>
              <rect x="4" y="5" width="16" height="15" rx="2" />
              <path d="M8 3v4M16 3v4M4 10h16" />
            </WebGlyph>
            <span>{when}</span>
          </p>
        ) : null}
        {queueLine ? <p className="sh-complaint-queue">{queueLine}</p> : null}
      </div>
      <div className="sh-complaint-ticket">
        <ComplaintStatusPill status={status} />
        <span className="sh-complaint-ticket-label">Ticket ID</span>
        <span className="sh-complaint-ticket-id">{ticketNumber}</span>
      </div>
      <WebGlyph size={18} className="sh-complaint-chevron">
        <path d="m9 6 6 6-6 6" />
      </WebGlyph>
    </div>
  );
}
