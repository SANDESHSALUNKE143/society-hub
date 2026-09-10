import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import type { SocietyDto, TeamMemberDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { Icon } from "../components/icons";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { SocietyFlatsPanel } from "../components/SocietyFlatsPanel";
import { SocietyParkingsPanel } from "../components/SocietyParkingsPanel";
import { SOCIETY_COMING_SOON } from "../manage-nav";

const APP_URL =
  import.meta.env.VITE_APP_ORIGIN ??
  import.meta.env.VITE_WEB_URL ??
  "http://app.localhost:5173";

type SocietyTab = "team" | "flats" | "parkings" | "controls";

const SOCIETY_TABS: Array<{ id: SocietyTab; label: string }> = [
  { id: "team", label: "Team" },
  { id: "flats", label: "Flats" },
  { id: "parkings", label: "Parkings" },
  { id: "controls", label: "Controls" },
];

export function parseSocietyTab(value: string | null): SocietyTab {
  if (value === "flats" || value === "parkings" || value === "controls") return value;
  return "team";
}

const TEAM_ROLES = [
  { value: "chairperson", label: "Chairperson" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "cashier", label: "Cashier" },
  { value: "committee", label: "Committee member" },
] as const;

function roleLabel(role: string) {
  return TEAM_ROLES.find((r) => r.value === role)?.label ?? role;
}

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

function AddTeamMemberDialog({
  societyId,
  open,
  onClose,
  onAdded,
}: {
  societyId: string;
  open: boolean;
  onClose: () => void;
  onAdded: (detail: string) => Promise<void> | void;
}) {
  const { client } = useAuth();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof TEAM_ROLES)[number]["value"]>("chairperson");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setEmail("");
    setPhone("");
    setName("");
    setRole("chairperson");
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await client.addSocietyTeamMember(societyId, {
        email: email || undefined,
        phone: phone || undefined,
        name: name || undefined,
        role,
      });
      reset();
      await onAdded(
        `Added as ${res.role} on ${res.societyName}. They can sign in with this mobile (OTP) at ${APP_URL} in Admin mode.`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to add team member");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="sh-dialog-backdrop"
      data-testid="add-team-dialog-backdrop"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-team-dialog-title"
        className="sh-dialog"
        data-testid="add-team-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id="add-team-dialog-title" className="font-semibold">
            Add to society team
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid="add-team-dialog-close"
            disabled={busy}
            onClick={close}
          >
            Close
          </button>
        </div>
        <form
          className="grid gap-4 sm:grid-cols-2"
          data-testid="add-team-form"
          onSubmit={submit}
        >
          <div>
            <label className="label" htmlFor="team-email">
              Email
            </label>
            <input
              id="team-email"
              data-testid="add-team-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="team-phone">
              Mobile
            </label>
            <input
              id="team-phone"
              data-testid="add-team-phone"
              className="input"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              minLength={10}
              maxLength={15}
              placeholder="10-digit mobile"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="team-name">
              Name (optional)
            </label>
            <input
              id="team-name"
              data-testid="add-team-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="team-role">
              Role
            </label>
            <select
              id="team-role"
              data-testid="add-team-role"
              className="input"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof TEAM_ROLES)[number]["value"])}
            >
              {TEAM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <button
              className="btn btn-primary"
              data-testid="add-team-submit"
              disabled={busy}
              type="submit"
            >
              Add to society team
            </button>
            <button
              className="btn btn-ghost"
              data-testid="add-team-cancel"
              disabled={busy}
              type="button"
              onClick={close}
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="sm:col-span-2 text-sm text-[var(--danger)]">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}

function SocietyTeamList({
  members,
  busy,
  currentUserId,
  onRemove,
}: {
  members: TeamMemberDto[] | null;
  busy: boolean;
  currentUserId: string | undefined;
  onRemove: (member: TeamMemberDto) => void;
}) {
  if (members === null) {
    return <p className="text-sm text-black/50">Loading team…</p>;
  }
  if (members.length === 0) {
    return (
      <div className="empty-state flex-1" data-testid="team-empty">
        No team members yet.
      </div>
    );
  }
  return (
    <div className="table-wrap table-scroll">
      <table className="data-table" data-testid="team-table">
        <thead>
            <tr>
              <th>No.</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, index) => (
              <tr key={`${m.userId}-${m.role}`}>
                <td className="tabular-nums text-black/50">{index + 1}</td>
                <td>{m.name ?? "—"}</td>
              <td>{m.email ?? "—"}</td>
              <td>{m.phone ?? "—"}</td>
              <td>
                <span className="badge">{roleLabel(m.role)}</span>
              </td>
              <td>
                {m.userId !== currentUserId ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid={`team-remove-${m.userId}`}
                    disabled={busy}
                    onClick={() => onRemove(m)}
                  >
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-black/45">You</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SocietyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseSocietyTab(searchParams.get("tab"));
  const { client, user } = useAuth();
  const [society, setSociety] = useState<SocietyDto | null>(null);
  const [members, setMembers] = useState<TeamMemberDto[] | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [removeMessage, setRemoveMessage] = useState<string | null>(null);
  const [addTeamMessage, setAddTeamMessage] = useState<string | null>(null);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TeamMemberDto | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function setTab(next: SocietyTab) {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "team") nextParams.delete("tab");
    else nextParams.set("tab", next);
    setSearchParams(nextParams, { replace: true });
  }

  const loadTeam = useCallback(() => {
    if (!id) return Promise.resolve();
    setTeamError(null);
    return client
      .listSocietyTeam(id)
      .then((rows) => setMembers(rows))
      .catch((err) => {
        setMembers([]);
        setTeamError(errMessage(err, "Failed to load society team"));
      });
  }, [client, id]);

  useEffect(() => {
    if (!id) return;
    client.getSociety(id).then(setSociety).catch(() => undefined);
    void loadTeam();
  }, [client, id, loadTeam]);

  if (user?.role !== "superadmin") {
    return <Navigate to="/login" replace />;
  }
  if (!id) return null;
  const societyId = id;

  function closeRemove() {
    if (busy) return;
    setPendingRemove(null);
    setRemoveError(null);
  }

  async function confirmRemove() {
    if (!pendingRemove || pendingRemove.userId === user?.id) return;
    setBusy(true);
    setRemoveMessage(null);
    setTeamError(null);
    setRemoveError(null);
    try {
      await client.removeSocietyTeamMember(societyId, pendingRemove.userId);
      setPendingRemove(null);
      setRemoveMessage("Team member removed.");
      await loadTeam();
    } catch (err) {
      setRemoveError(errMessage(err, "Failed to remove team member"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Link to="/societies" className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--leaf)]">
        <Icon name="back" className="h-4 w-4" />
        All societies
      </Link>

      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">{society?.name ?? "Society"}</h1>
          <p className="mt-1 text-sm text-black/55">
            {[society?.city, society?.pincode].filter(Boolean).join(" · ") ||
              society?.address ||
              ""}
          </p>
          {society?.chairpersonName && (
            <p className="mt-1 text-sm text-black/55">
              Chairperson: {society.chairpersonName}
              {society.chairpersonPhone ? ` · ${society.chairpersonPhone}` : ""}
              {society.chairpersonEmail ? ` · ${society.chairpersonEmail}` : ""}
            </p>
          )}
        </div>
        <a className="btn btn-ghost text-sm" href={APP_URL} target="_blank" rel="noreferrer">
          Open Client App
        </a>
      </div>

      <div
        role="tablist"
        aria-label="Society sections"
        className="sh-tabs"
        data-testid="society-tabs"
      >
        {SOCIETY_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`society-tab-${item.id}`}
            aria-selected={tab === item.id}
            aria-controls={`society-panel-${item.id}`}
            data-testid={`society-tab-${item.id}`}
            className="sh-tab"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "team" && (
        <div
          role="tabpanel"
          id="society-panel-team"
          aria-labelledby="society-tab-team"
          data-testid="society-panel-team"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Society team</h2>
              <p className="mt-1 text-sm text-black/55">
                People with Client App Admin access for this society. Include a mobile
                number so they can sign in with OTP.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="add-team-open"
              disabled={busy}
              onClick={() => {
                setAddTeamMessage(null);
                setTeamDialogOpen(true);
              }}
            >
              Add member
            </button>
          </div>
          {teamError && <p className="mb-2 shrink-0 text-sm text-[var(--danger)]">{teamError}</p>}
          {removeMessage && (
            <p className="mb-2 shrink-0 text-sm text-[var(--leaf)]">{removeMessage}</p>
          )}
          {addTeamMessage && (
            <p className="mb-2 shrink-0 text-sm text-[var(--leaf)]">{addTeamMessage}</p>
          )}
          <SocietyTeamList
            members={members}
            busy={busy}
            currentUserId={user?.id}
            onRemove={(m) => {
              if (m.userId === user?.id) return;
              setPendingRemove(m);
              setRemoveError(null);
            }}
          />
          <AddTeamMemberDialog
            societyId={id}
            open={teamDialogOpen}
            onClose={() => setTeamDialogOpen(false)}
            onAdded={async (detail) => {
              setAddTeamMessage(detail);
              await loadTeam();
            }}
          />
          <ConfirmDialog
            open={pendingRemove !== null}
            title="Remove team member"
            message={
              pendingRemove
                ? `Remove ${pendingRemove.name ?? pendingRemove.email ?? pendingRemove.phone ?? "this person"} from the society team?`
                : ""
            }
            confirmLabel="Remove"
            busy={busy}
            error={removeError}
            onCancel={closeRemove}
            onConfirm={() => void confirmRemove()}
            testId="remove-team-dialog"
          />
        </div>
      )}

      {tab === "flats" && (
        <div
          role="tabpanel"
          id="society-panel-flats"
          aria-labelledby="society-tab-flats"
          data-testid="society-panel-flats"
          className="flex min-h-0 flex-1 flex-col"
        >
          <SocietyFlatsPanel societyId={id} />
        </div>
      )}

      {tab === "parkings" && (
        <div
          role="tabpanel"
          id="society-panel-parkings"
          aria-labelledby="society-tab-parkings"
          data-testid="society-panel-parkings"
          className="flex min-h-0 flex-1 flex-col"
        >
          <SocietyParkingsPanel societyId={id} />
        </div>
      )}

      {tab === "controls" && (
        <div
          role="tabpanel"
          id="society-panel-controls"
          aria-labelledby="society-tab-controls"
          data-testid="society-planned-controls"
          className="min-h-0 flex-1 overflow-auto"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Platform controls for this society</h2>
            <span className="rounded-full bg-[var(--sand)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/50">
              Coming soon
            </span>
          </div>
          <p className="mb-4 text-sm text-black/55">
            Planned per-society controls. Shown for roadmap visibility — toggles are disabled
            and do not save.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SOCIETY_COMING_SOON.map((row) => (
              <div
                key={row.title}
                className="card flex items-start justify-between gap-3 p-4 opacity-80"
              >
                <div>
                  <p className="text-sm font-medium">{row.title}</p>
                  <p className="mt-1 text-xs text-black/50">{row.detail}</p>
                </div>
                <button
                  type="button"
                  className="relative h-6 w-11 shrink-0 rounded-full bg-black/15"
                  disabled
                  aria-disabled="true"
                  title="Coming soon"
                >
                  <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/feature-flags" className="btn btn-ghost text-sm">
              Global feature flags
            </Link>
            <Link to="/subscriptions" className="btn btn-ghost text-sm">
              Subscriptions
            </Link>
            <Link to="/payments" className="btn btn-ghost text-sm">
              Payments
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
