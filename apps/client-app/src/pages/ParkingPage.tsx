import { useCallback, useEffect, useState } from "react";
import type { ParkingKind, ParkingSlotDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  ShDataTable,
  ShPage,
  ShPageHeader,
  type ShColumn,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";

function kindLabel(kind: ParkingKind) {
  return kind === "puzzle" ? "Puzzle" : "Open";
}

function AdminParkingInventory() {
  const { client } = useAuth();
  const [rows, setRows] = useState<ParkingSlotDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flatId, setFlatId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    client
      .listParkings()
      .then(setRows)
      .catch((err) => {
        setRows([]);
        setError(err instanceof ApiClientError ? err.body.message : "Could not load parking");
      })
      .finally(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(id: string) {
    if (!flatId.trim()) {
      setError("Enter a flat id to assign");
      return;
    }
    try {
      await client.assignParking(id, flatId.trim());
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Assign failed");
    }
  }

  async function release(id: string) {
    try {
      await client.releaseParking(id);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Release failed");
    }
  }

  const columns: ShColumn<ParkingSlotDto>[] = [
    { key: "kind", header: "Kind", render: (row) => kindLabel(row.kind) },
    { key: "wing", header: "Wing", render: (row) => row.wing ?? "—" },
    { key: "slot", header: "Slot", render: (row) => row.slotNumber },
    { key: "flat", header: "Assigned flat", render: (row) => row.flatNumber ?? "Free" },
    {
      key: "actions",
      header: "Actions",
      render: (row) =>
        row.flatId ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => release(row.id)}>
            Release
          </button>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => assign(row.id)}>
            Assign
          </button>
        ),
    },
  ];

  return (
    <ShPage wide>
      <ShPageHeader
        title="Parking"
        description="Assign or release Manage inventory lots to flats. Enter a flat UUID below before Assign."
      />
      <div className="mb-3 max-w-md">
        <label className="label">Flat id for assign</label>
        <input className="input" value={flatId} onChange={(e) => setFlatId(e.target.value)} placeholder="Flat UUID from Residents → Flats" />
      </div>
      {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}
      <ShDataTable
        testId="parking-table"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={null}
        onRetry={load}
        emptyMessage="No parking lots yet — add them in the Manage portal."
      />
    </ShPage>
  );
}

export function ParkingPage() {
  const { client, user } = useAuth();
  const { mode } = useAppMode();
  const staffView = canUseAdminMode(user?.role) && mode === "admin";
  const [mine, setMine] = useState<ParkingSlotDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (staffView) return;
    client
      .listParkingSlots()
      .then((p) => setMine(p.items))
      .catch((err) => {
        setMine([]);
        setError(err instanceof Error ? err.message : "Failed");
      });
  }, [client, staffView]);

  if (staffView) return <AdminParkingInventory />;

  return (
    <div>
      <h1 className="font-display text-2xl">Parking</h1>
      <p className="mt-1 text-sm text-black/55">Lots assigned to your flat.</p>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      {mine === null ? (
        <p className="mt-4 text-sm text-black/50">Loading…</p>
      ) : mine.length === 0 ? (
        <div className="empty-state mt-4">No parking lots on your flat yet.</div>
      ) : (
        <div className="table-wrap mt-4">
          <table className="data-table">
            <thead><tr><th>Slot</th><th>Kind</th><th>Vehicle</th></tr></thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.id}>
                  <td>{r.slotNumber}</td>
                  <td>{kindLabel(r.kind)}</td>
                  <td>{r.vehicleNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
