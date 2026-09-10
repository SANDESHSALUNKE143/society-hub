import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ComplaintType, FlatDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { canPickComplaintFlat, useAppMode } from "../app-mode";
import { Icon } from "../components/icons";
import { ComplaintPhotoDropzone, TYPE_LABELS, WingFlatSelect } from "@society-hub/ui";

const TYPES: ComplaintType[] = [
  "electric",
  "plumbing",
  "housekeeping",
  "security",
  "lift",
  "other",
];

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
};

export function NewComplaintPage() {
  const { client, user } = useAuth();
  const { mode } = useAppMode();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ComplaintType>("plumbing");
  const [typeOtherText, setTypeOtherText] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flats, setFlats] = useState<FlatDto[]>([]);
  const [flatId, setFlatId] = useState(user?.flatId ?? "");
  const staffPicker = canPickComplaintFlat(user?.role, mode);
  const linkedFlatMissing = !staffPicker && !user?.flatId;
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const previews = useMemo(
    () =>
      files.map((f) => ({
        name: f.name,
        url: URL.createObjectURL(f),
        isImage: f.type.startsWith("image/"),
      })),
    [files],
  );

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  useEffect(() => {
    if (!staffPicker) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await client.listFlats();
        if (cancelled) return;
        setFlats(rows);
        setFlatId((current) => current || rows[0]?.id || "");
      } catch {
        if (!cancelled) {
          setError("Could not load flats for this society. Select a society first.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, staffPicker]);

  function toggleMic() {
    const SR =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike })
        .webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition not supported in this browser");
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
      setDescription(text);
    };
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (linkedFlatMissing) {
        setError("Your account is not linked to a flat. Ask your society office to onboard you.");
        setBusy(false);
        return;
      }
      if (staffPicker && !flatId) {
        setError("Select a flat to raise this complaint");
        setBusy(false);
        return;
      }
      const created = await client.createComplaint({
        title,
        type,
        typeOtherText: type === "other" ? typeOtherText : null,
        description,
        flatId: staffPicker ? flatId : undefined,
      });
      for (const file of files) {
        await client.uploadAttachment(created.id, file);
      }
      navigate(`/complaints/${created.id}`, {
        state: { justCreated: true },
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sh-complaint-page">
      <div>
        <Link to="/complaints" className="sh-complaint-back">
          ← Back to complaints
        </Link>
        <h1 className="sh-complaint-heading">New complaint</h1>
        <p className="mt-1 text-sm text-black/55">
          Add photos if you can — you get a ticket number right away.
        </p>
      </div>
      {!staffPicker && user?.flatNumber && (
        <p className="sh-complaint-queue-banner" data-testid="complaint-linked-flat">
          Filing for flat <strong>{user.flatNumber}</strong>
        </p>
      )}
      {linkedFlatMissing && (
        <p className="sh-complaint-queue-banner" data-testid="complaint-no-flat">
          Your account is not linked to a flat. Ask your society office to onboard you
          before raising a complaint.
        </p>
      )}

      <form className="sh-complaint-form" onSubmit={onSubmit} data-testid="new-complaint-form">
        {staffPicker && (
          <div className="grid gap-3 sm:grid-cols-2">
            <WingFlatSelect
              flats={flats}
              value={flatId}
              onChange={setFlatId}
              wingLabel="Wing"
              flatLabel="Which flat?"
              wingHtmlFor="complaint-wing"
              flatHtmlFor="flat"
              wingTestId="complaint-wing"
              flatTestId="complaint-flat"
            />
          </div>
        )}

        <div className="sh-underline-field">
          <p className="sh-underline-label">Type</p>
          <div className="sh-type-chips" data-testid="complaint-type-chips">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                data-testid={`complaint-type-${t}`}
                className={[
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  type === t
                    ? "border-[var(--leaf)] bg-[var(--leaf)] text-white"
                    : "border-[var(--sand)] bg-white text-[var(--ink)]/80 hover:border-[var(--leaf)]",
                ].join(" ")}
                onClick={() => setType(t)}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {type === "other" && (
          <div className="sh-underline-field">
            <label className="sh-underline-label" htmlFor="other">
              Tell us the type
            </label>
            <input
              id="other"
              value={typeOtherText}
              onChange={(e) => setTypeOtherText(e.target.value)}
              required
            />
          </div>
        )}

        <div className="sh-underline-field">
          <label className="sh-underline-label" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            data-testid="complaint-title"
            placeholder="Water leakage in bathroom"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
          />
        </div>

        <div className="sh-underline-field">
          <div className="flex items-center justify-between gap-2">
            <label className="sh-underline-label" htmlFor="desc">
              Description
            </label>
            <button
              type="button"
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                listening
                  ? "border-[var(--danger)] bg-[var(--danger)]/10 text-[var(--danger)]"
                  : "border-[var(--sand)] bg-white text-[var(--leaf-dark)] hover:border-[var(--leaf)]",
              ].join(" ")}
              data-testid="complaint-description-mic"
              aria-pressed={listening}
              aria-label={listening ? "Stop recording" : "Record description with microphone"}
              onClick={toggleMic}
            >
              <Icon name="mic" className="h-4 w-4" />
              {listening ? "Stop" : "Record"}
            </button>
          </div>
          <textarea
            id="desc"
            data-testid="complaint-description"
            placeholder="A few sentences help the office understand and fix it faster."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            minLength={3}
          />
        </div>

        <ComplaintPhotoDropzone
          id="files"
          testId="complaint-files"
          count={files.length}
          onFiles={setFiles}
        />
        {previews.length > 0 && (
          <ul className="sh-complaint-photos mt-3">
            {previews.map((p) => (
              <li key={p.name} className="sh-complaint-photo">
                {p.isImage ? (
                  <img src={p.url} alt="" />
                ) : (
                  <p className="p-2 text-xs text-black/55">{p.name}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        <button
          className="btn btn-primary sh-complaint-submit"
          disabled={busy || linkedFlatMissing || (staffPicker && !flatId)}
          type="submit"
          data-testid="complaint-submit"
        >
          {busy ? "Submitting…" : "Submit complaint"}
        </button>
      </form>
    </div>
  );
}
