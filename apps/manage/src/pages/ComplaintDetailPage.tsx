import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ComplaintDto, ComplaintStatus } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  CommitteeNoteCard,
  ComplaintComments,
  ComplaintMetaRow,
  ComplaintStatusPill,
  ComplaintTimeline,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@society-hub/ui";
import { useAuth } from "../auth";

const STATUSES: ComplaintStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "resolved",
  "closed",
];

function accessToken() {
  return localStorage.getItem("sh_access") ?? "";
}

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { client, user } = useAuth();
  const [complaint, setComplaint] = useState<ComplaintDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [threadBody, setThreadBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    client
      .getComplaint(id)
      .then(setComplaint)
      .catch((err) => setError(err.message));
  }, [client, id]);

  async function updateStatus(status: ComplaintStatus) {
    if (!id) return;
    try {
      const updated = await client.updateComplaintStatus(id, status);
      setComplaint(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  async function postThread(kind: "comment" | "question") {
    if (!id || threadBody.trim().length < 1) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await client.addComplaintComment(id, threadBody.trim(), kind);
      setComplaint(updated);
      setThreadBody("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (error && !complaint) return <p className="text-[var(--danger)]">{error}</p>;
  if (!complaint) return <p>Loading…</p>;

  const typeLabel =
    complaint.type === "other" && complaint.typeOtherText
      ? complaint.typeOtherText
      : TYPE_LABELS[complaint.type];
  const canUpdate = user?.role === "admin" || user?.role === "superadmin";

  return (
    <div className="sh-complaint-page">
      <Link to="/complaints" className="sh-complaint-back">
        ← Back to complaints
      </Link>

      <header>
        <p className="sh-complaint-ticket-display">{complaint.ticketNumber}</p>
        <h1 className="sh-complaint-heading">{complaint.title}</h1>
        <div className="mt-3">
          <span data-testid="complaint-status">
            <ComplaintStatusPill status={complaint.status} outline />
          </span>
        </div>
        {complaint.residentName ? (
          <p className="mt-2 text-sm text-black/50">Raised by {complaint.residentName}</p>
        ) : null}
      </header>

      <ComplaintMetaRow
        flatNumber={complaint.flatNumber}
        createdAt={complaint.createdAt}
        typeLabel={typeLabel}
      />

      <p className="sh-complaint-copy whitespace-pre-wrap">{complaint.description}</p>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      <ComplaintComments comments={complaint.comments} currentUserId={user?.id} />

      {complaint.status !== "closed" ? (
        <section className="sh-complaint-block" data-testid="complaint-thread-form">
          <h2 className="sh-complaint-block-title">Add an update</h2>
          <textarea
            className="input min-h-20"
            data-testid="complaint-thread-body"
            placeholder="Ask a question or add a comment"
            value={threadBody}
            onChange={(e) => setThreadBody(e.target.value)}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              data-testid="complaint-add-comment"
              disabled={busy || threadBody.trim().length < 1}
              onClick={() => void postThread("comment")}
            >
              Add comment
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              data-testid="complaint-ask-question"
              disabled={busy || threadBody.trim().length < 1}
              onClick={() => void postThread("question")}
            >
              Ask a question
            </button>
          </div>
        </section>
      ) : null}

      <ComplaintTimeline events={complaint.statusEvents} />

      {complaint.closingNote ? <CommitteeNoteCard note={complaint.closingNote} /> : null}

      {complaint.attachments.length > 0 && (
        <section>
          <h2 className="sh-complaint-block-title">
            {complaint.attachments.length === 1
              ? "Photo (1)"
              : `Photos (${complaint.attachments.length})`}
          </h2>
          <ul className="sh-complaint-photos">
            {complaint.attachments.map((a, index) => (
              <li key={a.id}>
                <a
                  className="sh-complaint-photo block"
                  href={`${a.url}?access_token=${accessToken()}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {a.contentKind === "image" ? (
                    <img src={`${a.url}?access_token=${accessToken()}`} alt="" />
                  ) : (
                    <p className="p-3 text-xs text-[var(--leaf)]">
                      Video · {Math.round(a.byteSize / 1024)} KB
                    </p>
                  )}
                  <span className="sh-complaint-photo-count">
                    {index + 1}/{complaint.attachments.length}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canUpdate ? (
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn btn-sm ${complaint.status === s ? "btn-primary" : "btn-ghost"}`}
              onClick={() => updateStatus(s)}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
