import { useCallback, useEffect, useState } from "react";
import type { InvitationDto, InvitationStatus, Paginated } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  INVITATION_STATUS_LABELS,
  RESIDENT_TYPE_LABELS,
  ShConfirmDialog,
  ShDataTable,
  ShFilterBar,
  ShPagination,
  ShSelect,
  invitationBadgeClass,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...Object.entries(INVITATION_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

/**
 * List / resend / revoke leftover invitation tokens (CSV or older Send invite).
 * Creating residents is onboard-only — no send form here.
 */
export function PendingInvitationsPanel() {
  const { client } = useAuth();
  const [data, setData] = useState<Paginated<InvitationDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    load();
  }, [load]);

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
              onClick={() => void resend(row)}
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
    <div data-testid="pending-invitations">
      <p className="mb-3 text-sm text-black/55">
        Leftover invite links from CSV or older flows. New residents are added with{" "}
        <strong>Add resident</strong> — they can sign in with mobile OTP. Resend or revoke
        tokens here.
      </p>
      {message && <p className="mb-2 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}

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
        onConfirm={() => void confirmRevoke()}
        onCancel={() => {
          setRevoking(null);
          setActionError(null);
        }}
      />
    </div>
  );
}
