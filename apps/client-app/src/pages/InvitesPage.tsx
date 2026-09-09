import { FormEvent, useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type {
  FlatDto,
  InvitationDto,
  InvitationStatus,
  Paginated,
  ResidentType,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  INVITATION_STATUS_LABELS,
  RESIDENT_TYPE_LABELS,
  ShConfirmDialog,
  ShDataTable,
  ShField,
  ShFilterBar,
  ShFormGrid,
  ShPage,
  ShPageHeader,
  ShPagination,
  ShSection,
  ShSelect,
  ShSplit,
  invitationBadgeClass,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...Object.entries(INVITATION_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

export function InvitesPage() {
  const { client, user } = useAuth();
  const allowed = canUseAdminMode(user?.role);

  const [data, setData] = useState<Paginated<InvitationDto> | null>(null);
  const [flats, setFlats] = useState<FlatDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("resident");
  const [flatId, setFlatId] = useState("");
  const [residentType, setResidentType] = useState<ResidentType>("owner");
  const [channelEmail, setChannelEmail] = useState(true);
  const [channelWhatsapp, setChannelWhatsapp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<InvitationDto | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setListError(null);
    client
      .listInvitations({
        page,
        limit: PAGE_SIZE,
        status: (status || undefined) as InvitationStatus | undefined,
        search: search || undefined,
      })
      .then(setData)
      .catch((err) =>
        setListError(
          err instanceof ApiClientError ? err.body.message : "Could not load invitations",
        ),
      )
      .finally(() => setLoading(false));
  }, [client, page, status, search]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    client
      .listFlats()
      .then(setFlats)
      .catch(() => setFlats([]));
  }, [client, allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  const isResidentInvite = role === "resident" || role === "tenant";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const channels: Array<"email" | "whatsapp"> = [];
      if (channelEmail) channels.push("email");
      if (channelWhatsapp) channels.push("whatsapp");
      if (channels.length === 0) {
        setError("Select at least one channel (email or WhatsApp).");
        return;
      }
      const res = await client.createInvitation({
        name: name || null,
        email: email || null,
        phone: phone || null,
        role,
        flatId: isResidentInvite ? flatId || null : null,
        residentType: isResidentInvite ? residentType : null,
        channels,
      });
      const parts: string[] = [];
      if (res.delivery?.email) {
        parts.push(
          res.delivery.email.ok ? "email sent" : `email failed: ${res.delivery.email.error}`,
        );
      }
      if (res.delivery?.whatsapp) {
        parts.push(
          res.delivery.whatsapp.ok
            ? "WhatsApp queued"
            : `WhatsApp failed: ${res.delivery.whatsapp.error}`,
        );
      }
      setMessage(parts.length ? `Invite created (${parts.join("; ")})` : "Invite created");
      setName("");
      setEmail("");
      setPhone("");
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function resend(invitation: InvitationDto) {
    setError(null);
    setMessage(null);
    try {
      await client.resendInvitation(invitation.id);
      setMessage(`Invitation resent to ${invitation.email ?? invitation.phone}.`);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not resend");
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    setBusy(true);
    setActionError(null);
    try {
      await client.revokeInvitation(revoking.id);
      setMessage("Invitation revoked.");
      setRevoking(null);
      load();
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.body.message : "Could not revoke",
      );
    } finally {
      setBusy(false);
    }
  }

  const columns: ShColumn<InvitationDto>[] = [
    {
      key: "contact",
      header: "Invitee",
      render: (row) => (
        <div>
          <p className="font-medium">{row.name ?? row.email ?? row.phone ?? "—"}</p>
          <p className="text-xs text-black/45">{row.email ?? row.phone ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <span className="badge">{row.role}</span>
          {row.residentType && (
            <span className="badge">{RESIDENT_TYPE_LABELS[row.residentType]}</span>
          )}
        </div>
      ),
    },
    {
      key: "flat",
      header: "Flat",
      render: (row) => row.flatNumber ?? "—",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className={invitationBadgeClass(row.status)}>
          {INVITATION_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      key: "expires",
      header: "Expires",
      render: (row) => (
        <span className="text-xs text-black/55">
          {row.expiresAt ? row.expiresAt.slice(0, 10) : "—"}
          {row.resendCount > 0 && ` · resent ${row.resendCount}×`}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <div className="flex justify-end gap-1.5">
          {(row.status === "pending" || row.status === "expired") && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid={`invite-resend-${row.id}`}
              onClick={() => resend(row)}
            >
              Resend
            </button>
          )}
          {row.status !== "accepted" && row.status !== "revoked" && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid={`invite-revoke-${row.id}`}
              onClick={() => setRevoking(row)}
            >
              Revoke
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <ShPage wide>
      <ShPageHeader
        title="Invitations"
        description="Invite by email and/or WhatsApp. Invites expire after 14 days and can be resent or revoked."
      />

      <ShSplit>
        <ShSection title="Send an invitation" testId="invites-form">
          <form className="space-y-2.5" onSubmit={onSubmit}>
            <ShFormGrid>
              <ShField label="Name" htmlFor="invite-name">
                <input
                  id="invite-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </ShField>
              <ShField label="Role" htmlFor="invite-role">
                <select
                  id="invite-role"
                  className="input"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="resident">Resident</option>
                  <option value="chairperson">Chairperson</option>
                  <option value="secretary">Secretary</option>
                  <option value="treasurer">Treasurer</option>
                  <option value="committee">Committee</option>
                </select>
              </ShField>
              <ShField label="Email" htmlFor="invite-email">
                <input
                  id="invite-email"
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </ShField>
              <ShField label="Phone (WhatsApp)" htmlFor="invite-phone">
                <input
                  id="invite-phone"
                  className="input"
                  value={phone}
                  placeholder="9198xxxxxxxx"
                  onChange={(e) => setPhone(e.target.value)}
                />
              </ShField>
              {isResidentInvite && (
                <>
                  <ShField label="Flat" htmlFor="invite-flat">
                    <select
                      id="invite-flat"
                      className="input"
                      value={flatId}
                      data-testid="invite-flat"
                      onChange={(e) => setFlatId(e.target.value)}
                    >
                      <option value="">No flat yet</option>
                      {flats.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.wingName ? `${f.wingName}-` : ""}
                          {f.number}
                        </option>
                      ))}
                    </select>
                  </ShField>
                  <ShField label="Resident type" htmlFor="invite-resident-type">
                    <select
                      id="invite-resident-type"
                      className="input"
                      value={residentType}
                      onChange={(e) => setResidentType(e.target.value as ResidentType)}
                    >
                      {Object.entries(RESIDENT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </ShField>
                </>
              )}
            </ShFormGrid>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={channelEmail}
                  onChange={(e) => setChannelEmail(e.target.checked)}
                />
                Email
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={channelWhatsapp}
                  onChange={(e) => setChannelWhatsapp(e.target.checked)}
                />
                WhatsApp
              </label>
            </div>
            <button
              className="btn btn-primary"
              disabled={busy}
              type="submit"
              data-testid="invites-submit"
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </form>
          {message && <p className="mt-2 text-sm text-[var(--leaf)]">{message}</p>}
          {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
        </ShSection>

        <ShSection
          title="How invitations work"
          description="The invite link carries a one-time token."
        >
          <ul className="list-disc space-y-1 pl-4 text-xs text-black/60">
            <li>Only one active invitation can exist per person and role.</li>
            <li>Revoking frees the slot so a fresh invite can be sent immediately.</li>
            <li>Accepted residents land in <strong>Pending verification</strong> for review.</li>
            <li>Expired invites can be resent, which issues a new 14-day window.</li>
          </ul>
        </ShSection>
      </ShSplit>

      <div className="mt-4">
        <ShFilterBar testId="invites-filters">
          <div className="sh-field min-w-[12rem] flex-1">
            <label className="label" htmlFor="invite-search">
              Search
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPage(1);
                setSearch(searchDraft.trim());
              }}
            >
              <input
                id="invite-search"
                className="input"
                placeholder="Name, email or phone"
                value={searchDraft}
                data-testid="invites-search"
                onChange={(e) => setSearchDraft(e.target.value)}
              />
            </form>
          </div>
          <ShSelect
            label="Status"
            id="invite-status"
            testId="invites-filter-status"
            value={status}
            onChange={(v) => {
              setPage(1);
              setStatus(v);
            }}
            options={STATUS_OPTIONS}
          />
        </ShFilterBar>

        <ShDataTable
          testId="invites-table"
          columns={columns}
          rows={data?.items ?? null}
          rowKey={(row) => row.id}
          loading={loading}
          error={listError}
          onRetry={load}
          emptyMessage="No invitations match these filters."
        />

        {data && (
          <ShPagination
            testId="invites-pagination"
            page={data.page}
            limit={data.limit}
            total={data.total}
            onPageChange={setPage}
          />
        )}
      </div>

      <ShConfirmDialog
        open={Boolean(revoking)}
        title="Revoke invitation"
        message={`This invitation link will stop working. ${
          revoking?.email ?? revoking?.phone ?? "The invitee"
        } will not be able to join with it.`}
        confirmLabel="Revoke"
        danger
        busy={busy}
        error={actionError}
        onConfirm={confirmRevoke}
        onCancel={() => {
          setRevoking(null);
          setActionError(null);
        }}
      />
    </ShPage>
  );
}
