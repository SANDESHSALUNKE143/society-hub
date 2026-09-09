import { useCallback, useEffect, useState } from "react";
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
  ShDetailGrid,
  ShDetailItem,
  ShPage,
  ShPageHeader,
  ShSection,
  ShTabs,
  VERIFICATION_STATUS_LABELS,
  flatLabel,
  occupancyBadgeClass,
  occupancyPeriod,
  residentStatusBadgeClass,
  verificationBadgeClass,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

function OccupantRow({ occupant }: { occupant: FlatOccupantDto }) {
  return (
    <li
      className="flex flex-wrap items-center gap-2 border-b border-[var(--sand)]/60 py-2 last:border-0"
      data-testid={`occupant-${occupant.residentId}`}
    >
      <Link
        to={`/residents/${occupant.residentId}`}
        className="font-medium text-[var(--leaf-dark)]"
      >
        {occupant.name ?? "Unnamed"}
      </Link>
      <span className="badge">{RESIDENT_TYPE_LABELS[occupant.residentType]}</span>
      {occupant.isPrimary && <span className="badge badge-success">Primary</span>}
      <span className={residentStatusBadgeClass(occupant.status)}>
        {RESIDENT_STATUS_LABELS[occupant.status]}
      </span>
      <span className={verificationBadgeClass(occupant.verificationStatus)}>
        {VERIFICATION_STATUS_LABELS[occupant.verificationStatus]}
      </span>
      {occupant.familyCount > 0 && (
        <span className="text-xs text-black/45">
          +{occupant.familyCount} family
        </span>
      )}
      <span className="ml-auto text-xs text-black/45">
        {occupancyPeriod(occupant.moveInDate, occupant.moveOutDate)}
      </span>
    </li>
  );
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

      <ShTabs
        testId="flat-tabs"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "residents", label: "Residents", count: flat.currentOccupants.length },
          {
            id: "ownership",
            label: "Ownership",
            count: (flat.primaryOwner ? 1 : 0) + flat.coOwners.length,
          },
          { id: "vehicles", label: "Vehicles", count: flat.vehicles.length },
          { id: "history", label: "History" },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-3">
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
              <ShDetailItem label="Occupants">
                {flat.currentOccupants.length}
              </ShDetailItem>
              <ShDetailItem label="Vehicles">{flat.vehicles.length}</ShDetailItem>
              <ShDetailItem label="Documents">{flat.documentCount}</ShDetailItem>
            </ShDetailGrid>
          </ShSection>

          <ShSection title="Ownership" testId="flat-ownership-summary">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
              Primary owner
            </p>
            <p className="font-medium" data-testid="flat-primary-owner">
              {flat.primaryOwner?.name ?? "None recorded"}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-black/40">
              Co-owners
            </p>
            <p className="font-medium">
              {flat.coOwners.length
                ? flat.coOwners.map((o) => o.name ?? "Unnamed").join(", ")
                : "None"}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-black/40">
              Tenants
            </p>
            <p className="font-medium" data-testid="flat-tenants">
              {flat.tenants.length
                ? flat.tenants.map((o) => o.name ?? "Unnamed").join(", ")
                : "None"}
            </p>
          </ShSection>
        </div>
      )}

      {tab === "residents" && (
        <ShSection
          title="Current occupants"
          description="Everyone with a live membership on this flat."
          testId="flat-residents"
        >
          {flat.currentOccupants.length === 0 ? (
            <p className="empty-state">This flat is vacant.</p>
          ) : (
            <ul>
              {flat.currentOccupants.map((o) => (
                <OccupantRow key={o.residentId} occupant={o} />
              ))}
            </ul>
          )}
        </ShSection>
      )}

      {tab === "ownership" && (
        <ShSection title="Owners" testId="flat-ownership">
          {!flat.primaryOwner && flat.coOwners.length === 0 ? (
            <p className="empty-state">No owner recorded for this flat.</p>
          ) : (
            <ul>
              {flat.primaryOwner && <OccupantRow occupant={flat.primaryOwner} />}
              {flat.coOwners.map((o) => (
                <OccupantRow key={o.residentId} occupant={o} />
              ))}
            </ul>
          )}
        </ShSection>
      )}

      {tab === "vehicles" && (
        <ShSection
          title="Vehicles"
          description="From the society parking records linked to this flat."
          testId="flat-vehicles"
        >
          {flat.vehicles.length === 0 ? (
            <p className="empty-state">No vehicles recorded.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {flat.vehicles.map((v) => (
                <li key={v.id} className="flex items-center gap-2">
                  <span className="badge">{v.type}</span>
                  <span className="font-medium">{v.vehicleNumber ?? "No number"}</span>
                  <span className="text-black/45">Slot {v.slotNumber}</span>
                </li>
              ))}
            </ul>
          )}
        </ShSection>
      )}

      {tab === "history" && (
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
                  className="rounded-lg border border-[var(--sand)] p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-black/60">
                      {occupancyPeriod(entry.moveInDate, entry.moveOutDate)}
                    </span>
                    {entry.isCurrent && <span className="badge badge-success">Current</span>}
                  </div>
                  <p className="mt-1">
                    <span className="badge">{RESIDENT_TYPE_LABELS[entry.residentType]}</span>{" "}
                    <Link
                      to={`/residents/${entry.residentId}`}
                      className="font-medium text-[var(--leaf-dark)]"
                    >
                      {entry.name ?? "Unnamed"}
                    </Link>
                  </p>
                  {entry.moveOutReason && (
                    <p className="mt-0.5 text-xs text-black/45">
                      Reason: {entry.moveOutReason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ShSection>
      )}
    </ShPage>
  );
}
