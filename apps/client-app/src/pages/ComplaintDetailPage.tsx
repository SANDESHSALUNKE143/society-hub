import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { ComplaintDto, ComplaintStatus } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";
import { Icon } from "../components/icons";
import {
  CommitteeNoteCard,
  ComplaintMetaRow,
  ComplaintQueueBanner,
  ComplaintStatusPill,
  ComplaintTimeline,
  TYPE_LABELS,
} from "@society-hub/ui";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

function accessToken() {
  return localStorage.getItem("sh_web_access") ?? "";
}

export function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const justCreated = Boolean(
    (location.state as { justCreated?: boolean } | null)?.justCreated,
  );
  const { client, user } = useAuth();
  const { mode } = useAppMode();
  const showStaffControls = canUseAdminMode(user?.role) && mode === "admin";
  const [complaint, setComplaint] = useState<ComplaintDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (!id) return;
    client
      .getComplaint(id)
      .then(setComplaint)
      .catch((err) => setError(err.message));
  }, [client, id]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function toggleMic() {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition is not supported in this browser");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    recognitionRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-IN";
    rec.onresult = (ev) => {
      let text = "";
      for (let i = 0; i < ev.results.length; i++) {
        text += ev.results[i]![0]!.transcript;
      }
      setNote(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    setListening(true);
    setError(null);
  }

  async function applyStatus(status: ComplaintStatus) {
    if (!id || !complaint) return;
    if ((status === "resolved" || status === "closed") && note.trim().length < 3) {
      setError("Add a short closing comment before resolving or closing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of evidence) {
        await client.uploadAttachment(id, file);
      }
      const updated = await client.updateComplaintStatus(id, status, {
        note: note.trim() || null,
      });
      setComplaint(updated);
      setNote("");
      setEvidence([]);
      recognitionRef.current?.stop();
      setListening(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onEvidenceChange(e: FormEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    setEvidence(Array.from(input.files ?? []));
  }

  if (error && !complaint) return <p className="text-[var(--danger)]">{error}</p>;
  if (!complaint) return <p>Loading…</p>;

  const typeLabel =
    complaint.type === "other" && complaint.typeOtherText
      ? complaint.typeOtherText
      : TYPE_LABELS[complaint.type];

  return (
    <div className="sh-complaint-page">
      <Link to="/complaints" className="sh-complaint-back">
        ← Back to complaints
      </Link>

      {justCreated && (
        <div
          className="sh-committee"
          data-testid="complaint-created-banner"
        >
          <p className="sh-complaint-block-title">Complaint submitted</p>
          <p className="mt-1 text-sm text-black/70">
            Your ticket number is{" "}
            <strong data-testid="complaint-ticket-number">{complaint.ticketNumber}</strong>.
            The society office was notified by email and WhatsApp.
          </p>
          {complaint.queueHint && (
            <p className="mt-2 text-sm text-black/60" data-testid="complaint-queue-hint">
              {complaint.queueHint}
              {complaint.queuePosition != null
                ? ` (position #${complaint.queuePosition})`
                : ""}
            </p>
          )}
        </div>
      )}

      <header>
        <p className="sh-complaint-ticket-display">{complaint.ticketNumber}</p>
        <h1 className="sh-complaint-heading">{complaint.title}</h1>
        <div className="mt-3">
          <ComplaintStatusPill status={complaint.status} outline />
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

      {!justCreated && !showStaffControls && complaint.queueHint && complaint.status === "open" ? (
        <ComplaintQueueBanner hint={complaint.queueHint} />
      ) : null}

      <p className="sh-complaint-copy whitespace-pre-wrap">{complaint.description}</p>

      <ComplaintTimeline events={complaint.statusEvents} />

      {complaint.closingNote ? (
        <CommitteeNoteCard note={complaint.closingNote} testId="complaint-closing-note" />
      ) : null}

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
                    <img
                      src={`${a.url}?access_token=${accessToken()}`}
                      alt=""
                    />
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

      {showStaffControls && (
        <section
          className="sh-committee"
          data-testid="complaint-staff-actions"
        >
          <h2 className="sh-complaint-block-title">Office actions</h2>
          <p className="text-sm text-black/55">
            Leave in queue if busy. Acknowledge when seen. Start when work begins. Resolve/close
            with a short note.
          </p>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className="label mb-0" htmlFor="staff-note">
                Note / closing comment
              </label>
              <button
                type="button"
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  listening
                    ? "border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)]"
                    : "border-[var(--sand)] bg-white text-[var(--leaf-dark)] hover:border-[var(--leaf)]",
                ].join(" ")}
                data-testid="complaint-staff-note-mic"
                aria-pressed={listening}
                aria-label={listening ? "Stop recording" : "Record note with microphone"}
                onClick={toggleMic}
              >
                <Icon name="mic" className="h-4 w-4" />
                {listening ? "Stop" : "Record"}
              </button>
            </div>
            <textarea
              id="staff-note"
              data-testid="complaint-staff-note"
              className="input min-h-20"
              placeholder="Required when resolving or closing — or tap Record"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="staff-evidence">
              Evidence photos (optional)
            </label>
            <input
              id="staff-evidence"
              data-testid="complaint-staff-evidence"
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={onEvidenceChange}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {complaint.status === "open" && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                data-testid="complaint-ack"
                onClick={() => void applyStatus("assigned")}
              >
                Acknowledge
              </button>
            )}
            {(complaint.status === "open" || complaint.status === "assigned") && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                data-testid="complaint-start"
                onClick={() => void applyStatus("in_progress")}
              >
                Start work
              </button>
            )}
            {complaint.status !== "resolved" && complaint.status !== "closed" && (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                data-testid="complaint-resolve"
                onClick={() => void applyStatus("resolved")}
              >
                Mark resolved
              </button>
            )}
            {complaint.status !== "closed" && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                data-testid="complaint-close"
                onClick={() => void applyStatus("closed")}
              >
                Close ticket
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        </section>
      )}
    </div>
  );
}
