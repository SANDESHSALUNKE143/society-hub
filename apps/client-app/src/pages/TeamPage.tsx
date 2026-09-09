import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { TeamMemberDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
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
  const [items, setItems] = useState<TeamMemberDto[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("committee");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("committee");
  const allowed = canUseAdminMode(user?.role);

  function load() {
    return client
      .listTeam()
      .then((rows) => setItems(rows))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
  }

  useEffect(() => {
    if (!allowed) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, allowed]);

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
      const res = await client.addTeamMember({
        email: email || undefined,
        phone: phone || undefined,
        name: name || undefined,
        role,
      });
      setMessage(`Added as ${res.role}. They can sign in with this mobile (OTP).`);
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

  async function onRemove(m: TeamMemberDto) {
    if (m.userId === user?.id) return;
    const label = m.name ?? m.email ?? m.phone ?? "this person";
    if (!window.confirm(`Remove ${label} from the society team?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await client.removeTeamMember(m.userId);
      if (editingId === m.userId) setEditingId(null);
      setMessage("Team member removed.");
      await load();
    } catch (err) {
      setError(errMessage(err, "Failed to remove team member"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="team-page">
      <div className="mb-6">
        <h1 className="font-display text-2xl">Team</h1>
        <p className="mt-1 text-sm text-black/55">
          Staff with access to manage this society. Add a mobile number so they can
          sign in with OTP.
        </p>
      </div>

      <form
        className="card mb-8 grid gap-4 p-5 sm:grid-cols-2"
        data-testid="add-team-form"
        onSubmit={onAdd}
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
            onChange={(e) => setRole(e.target.value as StaffRole)}
          >
            {TEAM_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            className="btn btn-primary"
            data-testid="add-team-submit"
            disabled={busy}
            type="submit"
          >
            Add team member
          </button>
        </div>
      </form>

      {message && <p className="mb-4 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Team API isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="team-empty">
          No team members yet.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="team-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={`${m.userId}-${m.role}`}>
                  <td>{m.name ?? "—"}</td>
                  <td>{m.email ?? "—"}</td>
                  <td>{m.phone ?? "—"}</td>
                  <td>
                    <span className="badge">{m.role}</span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        data-testid={`team-edit-${m.userId}`}
                        disabled={busy}
                        onClick={() => startEdit(m)}
                      >
                        Edit
                      </button>
                      {m.userId !== user?.id && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`team-remove-${m.userId}`}
                          disabled={busy}
                          onClick={() => onRemove(m)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingId && (
        <form
          className="card mt-6 grid gap-4 p-5 sm:grid-cols-2"
          data-testid="edit-team-form"
          onSubmit={onSaveEdit}
        >
          <h2 className="font-semibold sm:col-span-2">Update team member</h2>
          <div>
            <label className="label" htmlFor="edit-team-email">
              Email
            </label>
            <input
              id="edit-team-email"
              data-testid="edit-team-email"
              className="input"
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-team-phone">
              Mobile
            </label>
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
          </div>
          <div>
            <label className="label" htmlFor="edit-team-name">
              Name
            </label>
            <input
              id="edit-team-name"
              data-testid="edit-team-name"
              className="input"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-team-role">
              Role
            </label>
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
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
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
    </div>
  );
}
