import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type {
  BuildingDto,
  Paginated,
  ResidentSummaryDto,
  WingDto,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  RESIDENT_STATUS_LABELS,
  RESIDENT_TYPE_LABELS,
  ShDataTable,
  ShFilterBar,
  ShPage,
  ShPageHeader,
  ShPagination,
  ShSelect,
  ShTabs,
  VERIFICATION_STATUS_LABELS,
  flatLabel,
  residentStatusBadgeClass,
  verificationBadgeClass,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";
import { OnboardHouseholdForm } from "../components/OnboardHouseholdForm";
import { PendingInvitationsPanel } from "../components/PendingInvitationsPanel";

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "owner", label: "Owner" },
  { value: "tenant", label: "Tenant" },
  { value: "family", label: "Family member" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  ...Object.entries(RESIDENT_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const VERIFICATION_OPTIONS = [
  { value: "", label: "All verification" },
  ...Object.entries(VERIFICATION_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

const PAGE_TABS = [
  { id: "directory", label: "Directory" },
  { id: "invites", label: "Pending invitations" },
] as const;

type PageTab = (typeof PAGE_TABS)[number]["id"];

/**
 * Admin resident hub: directory + leftover invitations, with Add resident dialog.
 */
export function ResidentsPage() {
  const { client, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const allowed = canUseAdminMode(user?.role);

  const tab: PageTab = params.get("tab") === "invites" ? "invites" : "directory";
  const addOpen = params.get("add") === "1";

  const [data, setData] = useState<Paginated<ResidentSummaryDto> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buildings, setBuildings] = useState<BuildingDto[]>([]);
  const [wings, setWings] = useState<WingDto[]>([]);
  const [searchDraft, setSearchDraft] = useState(params.get("search") ?? "");

  const query = useMemo(
    () => ({
      page: Number(params.get("page") ?? 1),
      limit: PAGE_SIZE,
      search: params.get("search") ?? undefined,
      buildingId: params.get("buildingId") || undefined,
      wingId: params.get("wingId") || undefined,
      residentType: (params.get("residentType") || undefined) as
        | ResidentSummaryDto["residentType"]
        | undefined,
      status: (params.get("status") || undefined) as
        | ResidentSummaryDto["status"]
        | undefined,
      verificationStatus: (params.get("verificationStatus") || undefined) as
        | ResidentSummaryDto["verificationStatus"]
        | undefined,
      sort: (params.get("sort") ?? "name") as "name" | "flat" | "createdAt" | "status",
      order: (params.get("order") ?? "asc") as "asc" | "desc",
    }),
    [params],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    client
      .listResidents(query)
      .then(setData)
      .catch((err) =>
        setError(
          err instanceof ApiClientError ? err.body.message : "Could not load residents",
        ),
      )
      .finally(() => setLoading(false));
  }, [client, query]);

  useEffect(() => {
    if (!allowed || tab !== "directory") return;
    load();
  }, [allowed, load, tab]);

  useEffect(() => {
    if (!allowed || !user?.tenantId) return;
    client
      .listBuildings(user.tenantId)
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, [client, user?.tenantId, allowed]);

  useEffect(() => {
    const buildingId = query.buildingId;
    if (!buildingId) {
      setWings([]);
      return;
    }
    client
      .listWings(buildingId)
      .then(setWings)
      .catch(() => setWings([]));
  }, [client, query.buildingId]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "buildingId") next.delete("wingId");
    setParams(next, { replace: true });
  }

  function setTab(next: PageTab) {
    const p = new URLSearchParams(params);
    if (next === "invites") p.set("tab", "invites");
    else p.delete("tab");
    p.delete("page");
    setParams(p, { replace: true });
  }

  function openAdd() {
    const p = new URLSearchParams(params);
    p.set("add", "1");
    setParams(p, { replace: true });
  }

  function closeAdd() {
    const p = new URLSearchParams(params);
    p.delete("add");
    setParams(p, { replace: true });
  }

  const columns: ShColumn<ResidentSummaryDto>[] = [
    {
      key: "name",
      header: "Resident",
      sortKey: "name",
      render: (row) => (
        <div>
          <Link
            to={`/residents/${row.id}`}
            className="font-medium text-[var(--leaf-dark)]"
            onClick={(e) => e.stopPropagation()}
          >
            {row.name ?? "Unnamed"}
          </Link>
          <p className="text-xs text-black/45">{row.phone ?? row.email ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "flat",
      header: "Flat",
      sortKey: "flat",
      render: (row) => (
        <div>
          <span className="font-medium">{flatLabel(row.flat)}</span>
          {row.flat?.buildingName && (
            <p className="text-xs text-black/45">{row.flat.buildingName}</p>
          )}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (row) => (
        <span className="badge">
          {RESIDENT_TYPE_LABELS[row.residentType]}
          {row.isPrimary ? "" : " · co"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortKey: "status",
      render: (row) => (
        <span className={residentStatusBadgeClass(row.status)}>
          {RESIDENT_STATUS_LABELS[row.status]}
        </span>
      ),
    },
    {
      key: "verification",
      header: "Verification",
      render: (row) => (
        <span className={verificationBadgeClass(row.verificationStatus)}>
          {VERIFICATION_STATUS_LABELS[row.verificationStatus]}
        </span>
      ),
    },
    {
      key: "moveIn",
      header: "Moved in",
      sortKey: "createdAt",
      render: (row) => (
        <span className="text-xs text-black/55">
          {row.moveInDate ? row.moveInDate.slice(0, 10) : "—"}
        </span>
      ),
    },
  ];

  return (
    <div data-testid="residents-page">
      <ShPage wide>
        <ShPageHeader
          title="Residents"
          description="Everyone linked to a flat in this society, including past occupants."
          actions={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              data-testid="residents-add"
              onClick={openAdd}
            >
              Add resident
            </button>
          }
        />

        <ShTabs
          items={[...PAGE_TABS]}
          value={tab}
          onChange={(id) => setTab(id as PageTab)}
          ariaLabel="Residents sections"
          testId="residents-tabs"
          idPrefix="residents-tab"
        />

        {tab === "directory" ? (
          <>
            <ShFilterBar testId="residents-filters">
              <div className="sh-field min-w-[14rem] flex-1">
                <label className="label" htmlFor="resident-search">
                  Search
                </label>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setParam("search", searchDraft.trim());
                  }}
                >
                  <input
                    id="resident-search"
                    className="input"
                    placeholder="Name, phone, email or flat"
                    value={searchDraft}
                    data-testid="residents-search"
                    onChange={(e) => setSearchDraft(e.target.value)}
                  />
                </form>
              </div>
              <ShSelect
                label="Building"
                id="resident-building"
                testId="residents-filter-building"
                value={query.buildingId ?? ""}
                onChange={(v) => setParam("buildingId", v)}
                options={[
                  { value: "", label: "All buildings" },
                  ...buildings.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
              <ShSelect
                label="Wing"
                id="resident-wing"
                testId="residents-filter-wing"
                value={query.wingId ?? ""}
                onChange={(v) => setParam("wingId", v)}
                options={[
                  { value: "", label: "All wings" },
                  ...wings.map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
              <ShSelect
                label="Type"
                id="resident-type"
                testId="residents-filter-type"
                value={query.residentType ?? ""}
                onChange={(v) => setParam("residentType", v)}
                options={TYPE_OPTIONS}
              />
              <ShSelect
                label="Status"
                id="resident-status"
                testId="residents-filter-status"
                value={query.status ?? ""}
                onChange={(v) => setParam("status", v)}
                options={STATUS_OPTIONS}
              />
              <ShSelect
                label="Verification"
                id="resident-verification"
                testId="residents-filter-verification"
                value={query.verificationStatus ?? ""}
                onChange={(v) => setParam("verificationStatus", v)}
                options={VERIFICATION_OPTIONS}
              />
            </ShFilterBar>

            <ShDataTable
              testId="residents-table"
              columns={columns}
              rows={data?.items ?? null}
              rowKey={(row) => row.id}
              loading={loading}
              error={error}
              onRetry={load}
              onRowClick={(row) => navigate(`/residents/${row.id}`)}
              emptyMessage="No residents match these filters."
              sort={{ sort: query.sort, order: query.order }}
              onSortChange={(next) => {
                const params2 = new URLSearchParams(params);
                params2.set("sort", next.sort);
                params2.set("order", next.order);
                params2.delete("page");
                setParams(params2, { replace: true });
              }}
            />

            {data && (
              <ShPagination
                testId="residents-pagination"
                page={data.page}
                limit={data.limit}
                total={data.total}
                onPageChange={(p) => setParam("page", String(p))}
              />
            )}
          </>
        ) : (
          <PendingInvitationsPanel />
        )}
      </ShPage>

      {addOpen
        ? createPortal(
            <div
              className="sh-dialog-backdrop"
              role="presentation"
              data-testid="residents-add-dialog-backdrop"
              onClick={(e) => {
                if (e.target === e.currentTarget) closeAdd();
              }}
            >
              <div
                className="sh-dialog sh-dialog-lg"
                role="dialog"
                aria-modal="true"
                aria-labelledby="residents-add-title"
                data-testid="residents-add-dialog"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 id="residents-add-title" className="font-display text-xl">
                      Add resident
                    </h2>
                    <p className="mt-1 text-sm text-black/55">
                      Save the household now. Optional Email / WhatsApp welcome — no invite
                      link.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid="residents-add-close"
                    onClick={closeAdd}
                  >
                    Close
                  </button>
                </div>
                <OnboardHouseholdForm
                  showCsv
                  onSaved={() => {
                    if (tab === "directory") load();
                  }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
