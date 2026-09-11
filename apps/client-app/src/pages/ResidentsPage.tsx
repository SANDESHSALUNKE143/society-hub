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
import { FlatsBladePanel } from "./FlatsBladePanel";

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

/** Top blade: Flats (units) | People (app users). */
const BLADE_TABS = [
  { id: "flats", label: "Flats" },
  { id: "people", label: "People" },
] as const;

type BladeTab = (typeof BLADE_TABS)[number]["id"];

const PEOPLE_TABS = [
  { id: "directory", label: "Directory" },
  { id: "invites", label: "Pending invitations" },
] as const;

type PeopleTab = (typeof PEOPLE_TABS)[number]["id"];

/**
 * Admin Residents blade: Flats (all units) + People (who can access the app).
 */
export function ResidentsPage() {
  const { client, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const allowed = canUseAdminMode(user?.role);

  // Legacy: `?tab=invites` → People/invites; `?tab=flats` → Flats; else People/directory.
  const rawTab = params.get("tab");
  const effectiveBlade: BladeTab = rawTab === "flats" ? "flats" : "people";
  const effectivePeople: PeopleTab = rawTab === "invites" ? "invites" : "directory";

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
    if (!allowed || effectiveBlade !== "people" || effectivePeople !== "directory") return;
    load();
  }, [allowed, load, effectiveBlade, effectivePeople]);

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

  function setBlade(next: BladeTab) {
    const p = new URLSearchParams(params);
    if (next === "flats") {
      p.set("tab", "flats");
    } else {
      p.delete("tab");
      p.delete("view");
      p.delete("occupancy");
    }
    p.delete("page");
    p.delete("search");
    p.delete("buildingId");
    p.delete("wingId");
    p.delete("residentType");
    p.delete("status");
    p.delete("verificationStatus");
    setParams(p, { replace: true });
  }

  function setPeopleTab(next: PeopleTab) {
    const p = new URLSearchParams(params);
    if (next === "invites") p.set("tab", "invites");
    else p.delete("tab");
    p.delete("page");
    p.delete("view");
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
    {
      key: "actions",
      header: "Actions",
      render: (row) => {
        const occupying = row.status !== "moved_out" && row.status !== "rejected";
        if (!occupying) return <span className="text-xs text-black/35">—</span>;
        return (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            data-testid={`resident-assign-team-${row.id}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/residents/${row.id}?assignTeam=1`);
            }}
          >
            Team role
          </button>
        );
      },
    },
  ];

  return (
    <div data-testid="residents-page">
      <ShPage wide>
        <ShPageHeader
          title="Residents"
          description="Flats and the people who can sign in. Towers and parking inventory are set in Manage."
          actions={
            effectiveBlade === "people" ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="residents-add"
                onClick={openAdd}
              >
                Add resident
              </button>
            ) : undefined
          }
        />

        <ShTabs
          items={[...BLADE_TABS]}
          value={effectiveBlade}
          onChange={(id) => setBlade(id as BladeTab)}
          ariaLabel="Residents blade"
          testId="residents-blade-tabs"
          idPrefix="residents-blade"
        />

        <div className="mt-4">
          {effectiveBlade === "flats" ? (
            <FlatsBladePanel />
          ) : (
            <>
              <ShTabs
                items={[...PEOPLE_TABS]}
                value={effectivePeople}
                onChange={(id) => setPeopleTab(id as PeopleTab)}
                ariaLabel="People sections"
                testId="residents-tabs"
                idPrefix="residents-tab"
              />

              {effectivePeople === "directory" ? (
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
                <div className="mt-4">
                  <PendingInvitationsPanel />
                </div>
              )}
            </>
          )}
        </div>
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
                    if (effectivePeople === "directory") load();
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
