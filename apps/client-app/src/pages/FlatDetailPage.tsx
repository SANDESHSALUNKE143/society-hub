import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type {
  FlatDetailDto,
  FlatOccupancyHistoryEntryDto,
  FlatOccupantDto,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  OCCUPANCY_LABELS,
  RESIDENT_STATUS_LABELS,
  RESIDENT_TYPE_LABELS,
  ShDataTable,
  ShDetailGrid,
  ShDetailItem,
  ShPage,
  ShPageHeader,
  ShSection,
  ShCountTabs,
  VERIFICATION_STATUS_LABELS,
  flatLabel,
  occupancyBadgeClass,
  occupancyPeriod,
  residentStatusBadgeClass,
  verificationBadgeClass,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

function occupantColumns(): ShColumn<FlatOccupantDto>[] {
  return [
    {
      key: "name",
      header: "Name",
      render: (o) => (
        <Link
          to={`/residents/${o.residentId}`}
          className="font-medium text-[var(--leaf-dark)]"
          onClick={(e) => e.stopPropagation()}
        >
          {o.name ?? "Unnamed"}
        </Link>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (o) => (
        <span className="badge">
          {RESIDENT_TYPE_LABELS[o.residentType]}
          {o.isPrimary ? " · Primary" : ""}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (o) => (
        <span className={residentStatusBadgeClass(o.status)}>
          {RESIDENT_STATUS_LABELS[o.status]}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      render: (o) => o.phone ?? "—",
    },
    {
      key: "period",
      header: "Period",
      render: (o) => occupancyPeriod(o.moveInDate, o.moveOutDate),
    },
  ];
}

export function FlatDetailPage() {
  const { id = "" } = useParams();
  const { client, user } = useAuth();
  const allowed = canUseAdminMode(user?.role);

  const [flat, setFlat] = useState<FlatDetailDto | null>(null);
  const [history, setHistory] = useState<FlatOccupancyHistoryEntryDto[]>([]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    client
      .getFlatDetail(id)
      .then(setFlat)
      .catch((err) =>
        setError(err instanceof ApiClientError ? err.body.message : "Could not load flat"),
      )
      .finally(() => setLoading(false));
  }, [client, id]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed || tab !== "history") return;
    client
      .listFlatHistory(id)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [client, id, tab, allowed]);

  const columns = useMemo(() => occupantColumns(), []);

  if (!allowed) return <Navigate to="/dashboard" replace />;
  if (loading) return <p className="p-8">Loading…</p>;
  if (error || !flat) {
    return (
      <ShPage wide>
        <ShPageHeader title="Flat" />
        <div className="empty-state" data-testid="flat-error">
          <p className="text-[var(--danger)]">{error ?? "Flat not found"}</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={load}>
            Try again
          </button>
        </div>
      </ShPage>
    );
  }

  const activeOccupants = flat.currentOccupants.filter((o) => o.status === "active");
  const ownerRows = [
    ...(flat.primaryOwner ? [flat.primaryOwner] : []),
    ...flat.coOwners,
  ];

  return (
    <ShPage wide>
      <ShPageHeader
        title={`Flat ${flatLabel(flat)}`}
        description={
          <>
            {flat.buildingName ?? "—"}
            {flat.wingName ? ` · Wing ${flat.wingName}` : ""}
            {flat.floor != null ? ` · Floor ${flat.floor}` : ""}
          </>
        }
        actions={
          <span
            className={occupancyBadgeClass(flat.occupancyStatus)}
            data-testid="flat-occupancy-status"
          >
            {OCCUPANCY_LABELS[flat.occupancyStatus]}
          </span>
        }
      />

      <ShCountTabs
        testId="flat-tabs"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "residents", label: "Residents", count: flat.currentOccupants.length },
          {
            id: "ownership",
            label: "Ownership",
            count: ownerRows.length,
          },
          { id: "vehicles", label: "Vehicles", count: flat.vehicles.length },
          { id: "history", label: "History" },
        ]}
      />

      {tab === "overview" && (
        <div className="mt-4 space-y-3">
          <ShSection title="Flat" testId="flat-overview">
            <ShDetailGrid>
              <ShDetailItem label="Building">{flat.buildingName ?? "—"}</ShDetailItem>
              <ShDetailItem label="Wing">{flat.wingName ?? "—"}</ShDetailItem>
              <ShDetailItem label="Floor">{flat.floor ?? "—"}</ShDetailItem>
              <ShDetailItem label="Flat number">{flat.number}</ShDetailItem>
              <ShDetailItem label="Parking">{flat.parkingSlot ?? "—"}</ShDetailItem>
              <ShDetailItem label="Occupancy" testId="flat-occupancy">
                {OCCUPANCY_LABELS[flat.occupancyStatus]}
              </ShDetailItem>
              <ShDetailItem label="Active occupants">
                {activeOccupants.length}
              </ShDetailItem>
              <ShDetailItem label="Vehicles">{flat.vehicles.length}</ShDetailItem>
              <ShDetailItem label="Documents">{flat.documentCount}</ShDetailItem>
            </ShDetailGrid>
          </ShSection>

          <ShSection
            title="Ownership"
            description="Active memberships only. Pending or suspended people appear under Residents."
            testId="flat-ownership-summary"
          >
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-black/40">
              Owners
            </p>
            <ShDataTable
              testId="flat-owners-table"
              columns={columns}
              rows={ownerRows}
              rowKey={(o) => o.residentId}
              emptyMessage="No active owner recorded."
            />

            <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-wide text-black/40">
              Active tenants
            </p>
            <ShDataTable
              testId="flat-tenants"
              columns={columns}
              rows={flat.tenants}
              rowKey={(o) => o.residentId}
              emptyMessage="No active tenants on this flat."
            />
          </ShSection>
        </div>
      )}

      {tab === "residents" && (
        <div className="mt-4">
          <ShSection
            title="Current occupants"
            description="Live memberships on this flat (active, pending verification, or suspended)."
            testId="flat-residents"
          >
            <ShDataTable
              testId="flat-residents-table"
              columns={[
                ...columns,
                {
                  key: "verification",
                  header: "Verification",
                  render: (o) => (
                    <span className={verificationBadgeClass(o.verificationStatus)}>
                      {VERIFICATION_STATUS_LABELS[o.verificationStatus]}
                    </span>
                  ),
                },
              ]}
              rows={flat.currentOccupants}
              rowKey={(o) => o.residentId}
              emptyMessage="This flat is vacant."
            />
          </ShSection>
        </div>
      )}

      {tab === "ownership" && (
        <div className="mt-4">
          <ShSection title="Owners" testId="flat-ownership">
            <ShDataTable
              testId="flat-ownership-table"
              columns={columns}
              rows={ownerRows}
              rowKey={(o) => o.residentId}
              emptyMessage="No owner recorded for this flat."
            />
          </ShSection>
        </div>
      )}

      {tab === "vehicles" && (
        <div className="mt-4">
          <ShSection
            title="Vehicles"
            description="Two-wheelers and four-wheelers recorded for this household."
            testId="flat-vehicles"
          >
            {flat.vehicles.length === 0 ? (
              <p className="empty-state">No vehicles recorded.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {flat.vehicles.map((v, i) => (
                  <li key={`${v.kind}-${v.registrationNumber ?? i}`} className="flex items-center gap-2">
                    <span className="badge">
                      {v.kind === "two_wheeler" ? "Two-wheeler" : "Four-wheeler"}
                    </span>
                    <span className="font-medium">{v.registrationNumber ?? "No number"}</span>
                    {v.parkingSlot ? (
                      <span className="text-black/45">Slot {v.parkingSlot}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </ShSection>
        </div>
      )}

      {tab === "history" && (
        <div className="mt-4">
          <ShSection
            title="Occupancy history"
            description="Every period this flat has been occupied, newest first."
            testId="flat-history"
          >
            {history.length === 0 ? (
              <p className="empty-state">No occupancy recorded yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {history.map((entry) => (
                  <li
                    key={entry.residentId}
                    className="flex flex-wrap items-center gap-2 border-b border-[var(--sand)]/60 py-2 last:border-0"
                  >
                    <Link
                      to={`/residents/${entry.residentId}`}
                      className="font-medium text-[var(--leaf-dark)]"
                    >
                      {entry.name ?? "Unnamed"}
                    </Link>
                    <span className="badge">{RESIDENT_TYPE_LABELS[entry.residentType]}</span>
                    <span className={residentStatusBadgeClass(entry.status)}>
                      {RESIDENT_STATUS_LABELS[entry.status]}
                    </span>
                    {entry.isCurrent && <span className="badge badge-success">Current</span>}
                    <span className="ml-auto text-xs text-black/45">
                      {occupancyPeriod(entry.moveInDate, entry.moveOutDate)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ShSection>
        </div>
      )}
    </ShPage>
  );
}
