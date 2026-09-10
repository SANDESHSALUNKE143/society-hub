import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { TeamMemberDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  ShConfirmDialog,
  ShDataTable,
  ShField,
  ShFormGrid,
  ShPage,
  ShPageHeader,
  ShSection,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

const TEAM_ROLES = [
  { value: "chairperson", label: "Chairperson" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "cashier", label: "Cashier" },
  { value: "committee", label: "Committee member" },
] as const;

type StaffRole = (typeof TEAM_ROLES)[number]["value"];

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

export function TeamPage() {
  const { client, user } = useAuth();
  const allowed = canUseAdminMode(user?.role);

  const [items, setItems] = useState<TeamMemberDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMemberDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("committee");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("committee");

  const load = useCallback(() => {
    setLoading(true);
    setListError(null);
    return client
      .listTeam()
      .then((rows) => {
        setItems(rows);
        setNotReady(false);
      })
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else {
          setListError(errMessage(err, "Could not load the team"));
        }
      })
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    if (!allowed) return;
    void load();
  }, [allowed, load]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  function startEdit(m: TeamMemberDto) {
    setEditingId(m.userId);
    setEditEmail(m.email ?? "");
    setEditPhone(m.phone ?? "");
    setEditName(m.name ?? "");
    setEditRole(
      TEAM_ROLES.some((r) => r.value === m.role) ? (m.role as StaffRole) : "committee",
    );
    setError(null);
    setMessage(null);
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await client.addTeamMember({
        email: email || undefined,
        phone: phone || undefined,
        name: name || undefined,
        role,
      });
      setMessage(`Added as ${role}. They can sign in with this mobile (OTP).`);
      setEmail("");
      setPhone("");
      setName("");
      await load();
    } catch (err) {
      setError(errMessage(err, "Failed to add team member"));
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await client.updateTeamMember(editingId, {
        email: editEmail || undefined,
        phone: editPhone || undefined,
        name: editName || undefined,
        role: editRole,
      });
      setMessage("Team member updated.");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(errMessage(err, "Failed to update team member"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    if (removing.userId === user?.id) return;
    setBusy(true);
    setActionError(null);
    try {
      await client.removeTeamMember(removing.userId);
      if (editingId === removing.userId) setEditingId(null);
      setMessage(`${removing.name ?? "Member"} removed from the team.`);
      setRemoving(null);
      await load();
    } catch (err) {
      setActionError(errMessage(err, "Could not remove member"));
    } finally {
      setBusy(false);
    }
  }

  const columns: ShColumn<TeamMemberDto>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => (
        <div>
          <p className="font-medium">{row.name ?? "Unnamed"}</p>
          <p className="text-xs text-black/45">{row.email ?? row.phone ?? "—"}</p>
        </div>
      ),
    },
    { key: "email", header: "Email", render: (row) => row.email ?? "—" },
    { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
    {
      key: "role",
      header: "Role",
      render: (row) => <span className="badge">{row.role}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid={`team-edit-${row.userId}`}
            disabled={busy}
            onClick={() => startEdit(row)}
          >
            Edit
          </button>
          {row.userId !== user?.id && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid={`team-remove-${row.userId}`}
              disabled={busy}
              onClick={() => setRemoving(row)}
            >
              Remove
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div data-testid="team-page">
      <ShPage wide>
        <ShPageHeader
          title="Team"
          description="Staff with access to manage this society. Add a mobile number so they can sign in with OTP. A society must always keep one chairperson."
        />

        <ShSection title="Add a team member" testId="add-team-form">
          <form className="space-y-2.5" onSubmit={onAdd}>
            <ShFormGrid>
              <ShField label="Email" htmlFor="team-email">
                <input
                  id="team-email"
                  className="input"
                  type="email"
                  value={email}
                  data-testid="add-team-email"
                  onChange={(e) => setEmail(e.target.value)}
                />
              </ShField>
              <ShField label="Mobile" htmlFor="team-phone">
                <input
                  id="team-phone"
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  minLength={10}
                  maxLength={15}
                  placeholder="10-digit mobile"
                  value={phone}
                  data-testid="add-team-phone"
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </ShField>
              <ShField label="Name (optional)" htmlFor="team-name">
                <input
                  id="team-name"
                  className="input"
                  value={name}
                  data-testid="add-team-name"
                  onChange={(e) => setName(e.target.value)}
                />
              </ShField>
              <ShField label="Role" htmlFor="team-role">
                <select
                  id="team-role"
                  className="input"
                  value={role}
                  data-testid="add-team-role"
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                >
                  {TEAM_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </ShField>
            </ShFormGrid>
            <p className="text-[11px] text-black/45">
              Provide a mobile so they can sign in with OTP. An existing SocietyHub
              account is reused when the phone or email matches.
            </p>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={busy}
              data-testid="add-team-submit"
            >
              {busy && !editingId ? "Adding…" : "Add team member"}
            </button>
          </form>
          {message && <p className="mt-2 text-sm text-[var(--leaf)]">{message}</p>}
          {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
          {notReady && (
            <p className="mt-2 text-sm text-[var(--alert)]">
              Team API isn't live yet — this screen will populate automatically once it is.
            </p>
          )}
        </ShSection>

        <div className="mt-4">
          <ShDataTable
            testId="team-table"
            columns={columns}
            rows={items}
            rowKey={(row) => `${row.userId}-${row.role}`}
            loading={loading}
            error={listError}
            onRetry={() => void load()}
            emptyMessage="No team members yet."
          />
        </div>

        {editingId && (
          <form
            className="card sh-section mt-4 space-y-2.5"
            data-testid="edit-team-form"
            onSubmit={onSaveEdit}
          >
            <h2 className="text-sm font-semibold">Update team member</h2>
            <ShFormGrid>
              <ShField label="Email" htmlFor="edit-team-email">
                <input
                  id="edit-team-email"
                  data-testid="edit-team-email"
                  className="input"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </ShField>
              <ShField label="Mobile" htmlFor="edit-team-phone">
                <input
                  id="edit-team-phone"
                  data-testid="edit-team-phone"
                  className="input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  minLength={10}
                  maxLength={15}
                  placeholder="10-digit mobile"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  required
                />
              </ShField>
              <ShField label="Name" htmlFor="edit-team-name">
                <input
                  id="edit-team-name"
                  data-testid="edit-team-name"
                  className="input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </ShField>
              <ShField label="Role" htmlFor="edit-team-role">
                <select
                  id="edit-team-role"
                  data-testid="edit-team-role"
                  className="input"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as StaffRole)}
                >
                  {TEAM_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </ShField>
            </ShFormGrid>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy} type="submit">
                Save changes
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setEditingId(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <ShConfirmDialog
          open={Boolean(removing)}
          title="Remove team member"
          message={`${removing?.name ?? "This person"} will lose the ${removing?.role} role and its admin access.`}
          confirmLabel="Remove"
          danger
          busy={busy}
          error={actionError}
          onConfirm={confirmRemove}
          onCancel={() => {
            setRemoving(null);
            setActionError(null);
          }}
        />
      </ShPage>
    </div>
  );
}
