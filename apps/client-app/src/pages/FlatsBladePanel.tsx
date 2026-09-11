import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  ShPagination,
  ShSelect,
  ShTabs,
  flatLabel,
  occupancyBadgeClass,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { SocietyLayoutPanel } from "./SocietyLayoutPanel";

const PAGE_SIZE = 20;

type FlatsView = "occupancy" | "layout";

const OCCUPANCY_OPTIONS = [
  { value: "", label: "All flats" },
  ...Object.entries(OCCUPANCY_LABELS).map(([value, label]) => ({ value, label })),
];

function OccupancyDirectory() {
  const { client, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
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
    load();
  }, [load]);

  useEffect(() => {
    if (!user?.tenantId) return;
    client
      .listBuildings(user.tenantId)
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, [client, user?.tenantId]);

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
    <>
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
        emptyMessage="No flats match these filters. Society structure is defined in Manage."
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
    </>
  );
}

/** Flats view inside the Residents blade (occupancy list + read-only layout). */
export function FlatsBladePanel() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as FlatsView | null) ?? "occupancy";
  const activeView: FlatsView = view === "layout" ? "layout" : "occupancy";

  function setView(next: FlatsView) {
    const p = new URLSearchParams(params);
    if (next === "occupancy") p.delete("view");
    else p.set("view", next);
    if (next !== "occupancy") {
      p.delete("page");
      p.delete("search");
      p.delete("buildingId");
      p.delete("occupancy");
    }
    setParams(p, { replace: true });
  }

  return (
    <div data-testid="flats-blade">
      <ShTabs
        ariaLabel="Flats views"
        testId="flats-tabs"
        idPrefix="flats"
        value={activeView}
        onChange={setView}
        items={[
          { id: "occupancy", label: "All flats" },
          { id: "layout", label: "Layout" },
        ]}
      />
      <div className="mt-4">
        {activeView === "occupancy" && <OccupancyDirectory />}
        {activeView === "layout" && user?.tenantId && (
          <SocietyLayoutPanel tenantId={user.tenantId} />
        )}
      </div>
    </div>
  );
}
