import { useCallback, useEffect, useMemo, useState } from "react";
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
  VERIFICATION_STATUS_LABELS,
  flatLabel,
  residentStatusBadgeClass,
  verificationBadgeClass,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

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

/**
 * Admin resident directory. Search, filters, sorting and paging are all
 * round-tripped to the API — the browser never holds the full resident list.
 */
export function ResidentsPage() {
  const { client, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const allowed = canUseAdminMode(user?.role);

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
    if (!allowed) return;
    load();
  }, [allowed, load]);

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

  /** Filter changes always reset to page 1 so results cannot land out of range. */
  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "buildingId") next.delete("wingId");
    setParams(next, { replace: true });
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
          <Link to="/onboard" className="btn btn-primary btn-sm" data-testid="residents-add">
            Add resident
          </Link>
        }
      />

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
    </ShPage>
    </div>
  );
}
