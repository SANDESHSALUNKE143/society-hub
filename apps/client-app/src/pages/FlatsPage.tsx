import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type {
  BuildingDto,
  FlatOccupancySummaryDto,
  Paginated,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  OCCUPANCY_LABELS,
  ShDataTable,
  ShFilterBar,
  ShPage,
  ShPageHeader,
  ShPagination,
  ShSelect,
  flatLabel,
  occupancyBadgeClass,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

const PAGE_SIZE = 20;

const OCCUPANCY_OPTIONS = [
  { value: "", label: "All flats" },
  ...Object.entries(OCCUPANCY_LABELS).map(([value, label]) => ({ value, label })),
];

/** Admin flat directory with derived occupancy, paged and filtered server-side. */
export function FlatsPage() {
  const { client, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const allowed = canUseAdminMode(user?.role);

  const [data, setData] = useState<Paginated<FlatOccupancySummaryDto> | null>(null);
  const [buildings, setBuildings] = useState<BuildingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(params.get("search") ?? "");

  const query = useMemo(
    () => ({
      page: Number(params.get("page") ?? 1),
      limit: PAGE_SIZE,
      search: params.get("search") || undefined,
      buildingId: params.get("buildingId") || undefined,
      occupancy: (params.get("occupancy") || undefined) as
        | FlatOccupancySummaryDto["occupancyStatus"]
        | undefined,
    }),
    [params],
  );

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    client
      .listFlatsWithOccupancy(query)
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.body.message : "Could not load flats"),
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

  if (!allowed) return <Navigate to="/dashboard" replace />;

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  const columns: ShColumn<FlatOccupancySummaryDto>[] = [
    {
      key: "flat",
      header: "Flat",
      render: (row) => (
        <Link
          to={`/flats/${row.id}`}
          className="font-medium text-[var(--leaf-dark)]"
          onClick={(e) => e.stopPropagation()}
        >
          {flatLabel(row)}
        </Link>
      ),
    },
    {
      key: "building",
      header: "Building",
      render: (row) => row.buildingName ?? "—",
    },
    { key: "wing", header: "Wing", render: (row) => row.wingName ?? "—" },
    { key: "floor", header: "Floor", render: (row) => row.floor ?? "—" },
    {
      key: "occupancy",
      header: "Occupancy",
      render: (row) => (
        <span className={occupancyBadgeClass(row.occupancyStatus)}>
          {OCCUPANCY_LABELS[row.occupancyStatus]}
        </span>
      ),
    },
    {
      key: "occupants",
      header: "Occupants",
      render: (row) => row.occupantCount,
    },
  ];

  return (
    <ShPage wide>
      <ShPageHeader
        title="Flats"
        description="Occupancy is derived from live memberships — it is never stored on the flat."
        actions={
          <Link to="/structure" className="btn btn-ghost btn-sm">
            Manage structure
          </Link>
        }
      />

      <ShFilterBar testId="flats-filters">
        <div className="sh-field min-w-[12rem] flex-1">
          <label className="label" htmlFor="flat-search">
            Search
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParam("search", searchDraft.trim());
            }}
          >
            <input
              id="flat-search"
              className="input"
              placeholder="Flat number"
              value={searchDraft}
              data-testid="flats-search"
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </form>
        </div>
        <ShSelect
          label="Building"
          id="flat-building"
          testId="flats-filter-building"
          value={query.buildingId ?? ""}
          onChange={(v) => setParam("buildingId", v)}
          options={[
            { value: "", label: "All buildings" },
            ...buildings.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        <ShSelect
          label="Occupancy"
          id="flat-occupancy"
          testId="flats-filter-occupancy"
          value={query.occupancy ?? ""}
          onChange={(v) => setParam("occupancy", v)}
          options={OCCUPANCY_OPTIONS}
        />
      </ShFilterBar>

      <ShDataTable
        testId="flats-table"
        columns={columns}
        rows={data?.items ?? null}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={load}
        onRowClick={(row) => navigate(`/flats/${row.id}`)}
        emptyMessage="No flats match these filters."
      />

      {data && (
        <ShPagination
          testId="flats-pagination"
          page={data.page}
          limit={data.limit}
          total={data.total}
          onPageChange={(p) => setParam("page", String(p))}
        />
      )}
    </ShPage>
  );
}
