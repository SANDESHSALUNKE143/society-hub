import type { ReactNode } from "react";
import type { ComplaintStatus } from "@society-hub/types";
import { STATUS_LABELS, statusTone } from "./complaint-labels";
import {
  formatComplaintWhen,
  formatComplaintTimelineWhen,
  timelineEventIcon,
  timelineEventTitle,
} from "./complaint-card";

function WebGlyph({
  children,
  size = 18,
}: {
  children: ReactNode;
  size?: number;
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
      aria-hidden="true"
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

function TimelineGlyph({ name }: { name: ReturnType<typeof timelineEventIcon> }) {
  if (name === "check") {
    return (
      <WebGlyph size={14}>
        <path d="m6 12 4 4 8-8" />
      </WebGlyph>
    );
  }
  if (name === "work") {
    return (
      <WebGlyph size={14}>
        <path d="M9 7V5h6v2" />
        <rect x="4" y="7" width="16" height="12" rx="2" />
      </WebGlyph>
    );
  }
  if (name === "done") {
    return (
      <WebGlyph size={14}>
        <circle cx="12" cy="12" r="8" />
        <path d="m8.5 12.2 2.4 2.3 4.6-5" />
      </WebGlyph>
    );
  }
  return (
    <WebGlyph size={14}>
      <path d="M4 12 20 5l-4 14-5-6-7-1Z" />
    </WebGlyph>
  );
}

export function ComplaintStatusPill({
  status,
  outline = false,
}: {
  status: ComplaintStatus;
  outline?: boolean;
}) {
  const tone = statusTone(status);
  return (
    <span className={outline ? `sh-status sh-status-outline sh-status-${tone}` : `sh-status sh-status-${tone}`}>
      {outline ? <span className="sh-status-dot" aria-hidden="true" /> : null}
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ComplaintMetaRow({
  flatNumber,
  createdAt,
  typeLabel,
}: {
  flatNumber?: string | null;
  createdAt?: string | null;
  typeLabel?: string | null;
}) {
  return (
    <div className="sh-complaint-facts">
      <div className="sh-complaint-fact">
        <span className="sh-complaint-fact-icon">
          <WebGlyph>
            <path d="M4 21V8l8-5 8 5v13" />
            <path d="M9 21v-6h6v6" />
          </WebGlyph>
        </span>
        <div>
          <p className="sh-complaint-fact-label">Flat</p>
          <p className="sh-complaint-fact-value">{flatNumber?.trim() || "—"}</p>
        </div>
      </div>
      <div className="sh-complaint-fact-rule" aria-hidden="true" />
      <div className="sh-complaint-fact">
        <span className="sh-complaint-fact-icon">
          <WebGlyph>
            <rect x="4" y="5" width="16" height="15" rx="2" />
            <path d="M8 3v4M16 3v4M4 10h16" />
          </WebGlyph>
        </span>
        <div>
          <p className="sh-complaint-fact-label">Raised</p>
          <p className="sh-complaint-fact-value">{formatComplaintWhen(createdAt) || "—"}</p>
        </div>
      </div>
      {typeLabel ? (
        <>
          <div className="sh-complaint-fact-rule" aria-hidden="true" />
          <div className="sh-complaint-fact">
            <span className="sh-complaint-fact-icon">
              <WebGlyph>
                <path d="M7 4h8l2 3v13H7V4Z" />
                <path d="M9 11h6M9 15h4" />
              </WebGlyph>
            </span>
            <div>
              <p className="sh-complaint-fact-label">Type</p>
              <p className="sh-complaint-fact-value">{typeLabel}</p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ComplaintQueueBanner({
  hint,
  testId,
}: {
  hint: string;
  testId?: string;
}) {
  return (
    <p className="sh-complaint-queue-banner" data-testid={testId}>
      <WebGlyph size={16}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v5l3 2" />
      </WebGlyph>
      <span>{hint}</span>
    </p>
  );
}

export function ComplaintTimeline({
  events,
}: {
  events: Array<{
    id: string;
    fromStatus?: string | null;
    toStatus: string;
    note?: string | null;
    actorName?: string | null;
    createdAt?: string | null;
  }>;
}) {
  if (events.length === 0) return null;
  return (
    <section className="sh-complaint-block">
      <h2 className="sh-complaint-block-title">Timeline</h2>
      <ol className="sh-timeline">
        {events.map((ev, index) => (
          <li key={ev.id} className="sh-timeline-item">
            <span className="sh-timeline-node" aria-hidden="true">
              <TimelineGlyph name={timelineEventIcon(ev.toStatus)} />
            </span>
            {index !== events.length - 1 ? <span className="sh-timeline-line" aria-hidden="true" /> : null}
            <div className="sh-timeline-body">
              <p className="sh-timeline-title">
                {timelineEventTitle(ev.fromStatus, ev.toStatus, STATUS_LABELS)}
              </p>
              {ev.createdAt ? (
                <p className="sh-timeline-when">{formatComplaintTimelineWhen(ev.createdAt)}</p>
              ) : null}
              {ev.actorName ? <p className="sh-timeline-when">by {ev.actorName}</p> : null}
              {ev.note ? <p className="sh-timeline-note">{ev.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ComplaintComments({
  comments,
  currentUserId,
}: {
  comments: Array<{
    id: string;
    userId: string;
    authorName: string | null;
    body: string;
    kind?: "comment" | "question";
    createdAt: string;
  }>;
  currentUserId?: string | null;
}) {
  if (comments.length === 0) return null;
  return (
    <section className="sh-complaint-block" data-testid="complaint-comments">
      <h2 className="sh-complaint-block-title">Updates & comments</h2>
      <ol className="space-y-3">
        {comments.map((c) => {
          const mine = Boolean(currentUserId && c.userId === currentUserId);
          const question = c.kind === "question";
          return (
            <li key={c.id} className="rounded-xl bg-[var(--mist)]/50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
                {question ? "Question" : "Comment"}
                {c.authorName ? ` · ${mine ? "You" : c.authorName}` : mine ? " · You" : ""}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
              {c.createdAt ? (
                <p className="mt-1 text-xs text-black/45">
                  {formatComplaintTimelineWhen(c.createdAt)}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function CommitteeNoteCard({
  note,
  testId,
}: {
  note: string;
  testId?: string;
}) {
  return (
    <aside className="sh-committee">
      <WebGlyph size={22}>
        <circle cx="9" cy="8" r="2.5" />
        <circle cx="15" cy="8" r="2.5" />
        <path d="M5 18c.6-2.4 2.4-3.6 4-3.6s3.4 1.2 4 3.6" />
        <path d="M11 18c.6-2.4 2.4-3.6 4-3.6s3.4 1.2 4 3.6" />
      </WebGlyph>
      <h2 className="sh-complaint-block-title">Note from Committee</h2>
      <p data-testid={testId}>{note}</p>
      <p className="sh-committee-by">— Maintenance Committee</p>
    </aside>
  );
}
