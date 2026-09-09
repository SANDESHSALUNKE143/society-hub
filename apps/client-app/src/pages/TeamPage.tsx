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

const STAFF_ROLES = [
  "chairperson",
  "secretary",
  "treasurer",
  "cashier",
  "committee",
] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

export function TeamPage() {
  const { client, user } = useAuth();
  const allowed = canUseAdminMode(user?.role);

  const [items, setItems] = useState<TeamMemberDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TeamMemberDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("committee");

  const load = useCallback(() => {
    setLoading(true);
    setListError(null);
    client
      .listTeam()
      .then(setItems)
      .catch((err) => {
        setItems([]);
        setListError(
          err instanceof ApiClientError ? err.body.message : "Could not load the team",
        );
      })
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  async function addMember(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await client.addTeamMember({
        name: name.trim() || undefined,
        email: email.trim() || null,
        phone: phone.trim() || null,
        role,
      });
      setItems(next);
      setMessage(`Added as ${role}.`);
      setName("");
      setEmail("");
      setPhone("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not add member");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: TeamMemberDto, toRole: string) {
    if (toRole === member.role) return;
    setError(null);
    setMessage(null);
    try {
      setItems(await client.changeTeamRole(member.userId, member.role, toRole));
      setMessage(`${member.name ?? "Member"} is now ${toRole}.`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not change role");
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    setActionError(null);
    try {
      setItems(await client.removeTeamRole(removing.userId, removing.role));
      setMessage(`${removing.name ?? "Member"} removed from the team.`);
      setRemoving(null);
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.body.message : "Could not remove member",
      );
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
    { key: "phone", header: "Phone", render: (row) => row.phone ?? "—" },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <select
          className="input !py-1 text-xs"
          value={row.role}
          data-testid={`team-role-${row.userId}`}
          onChange={(e) => changeRole(row, e.target.value)}
        >
          {/* Legacy `admin` rows can be displayed but not re-selected. */}
          {row.role === "admin" && <option value="admin">admin (legacy)</option>}
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid={`team-remove-${row.userId}`}
            onClick={() => setRemoving(row)}
          >
            Remove
          </button>
        </div>
      ),
    },
  ];

  return (
    <ShPage wide>
      <ShPageHeader
        title="Team"
        description="Staff with access to manage this society. A society must always keep one chairperson."
      />

      <ShSection title="Add a team member" testId="team-form">
        <form className="space-y-2.5" onSubmit={addMember}>
          <ShFormGrid>
            <ShField label="Name" htmlFor="team-name">
              <input
                id="team-name"
                className="input"
                value={name}
                data-testid="team-name"
                onChange={(e) => setName(e.target.value)}
              />
            </ShField>
            <ShField label="Role" htmlFor="team-add-role">
              <select
                id="team-add-role"
                className="input"
                value={role}
                data-testid="team-add-role"
                onChange={(e) => setRole(e.target.value as StaffRole)}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </ShField>
            <ShField label="Email" htmlFor="team-email">
              <input
                id="team-email"
                className="input"
                type="email"
                value={email}
                data-testid="team-email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </ShField>
            <ShField label="Phone" htmlFor="team-phone">
              <input
                id="team-phone"
                className="input"
                value={phone}
                data-testid="team-phone"
                onChange={(e) => setPhone(e.target.value)}
              />
            </ShField>
          </ShFormGrid>
          <p className="text-[11px] text-black/45">
            Provide an email or a phone. An existing SocietyHub account is reused when
            one matches.
          </p>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={busy}
            data-testid="team-add"
          >
            {busy ? "Adding…" : "Add member"}
          </button>
        </form>
        {message && <p className="mt-2 text-sm text-[var(--leaf)]">{message}</p>}
        {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      </ShSection>

      <div className="mt-4">
        <ShDataTable
          testId="team-table"
          columns={columns}
          rows={items}
          rowKey={(row) => `${row.userId}-${row.role}`}
          loading={loading}
          error={listError}
          onRetry={load}
          emptyMessage="No team members yet."
        />
      </div>

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
  );
}
