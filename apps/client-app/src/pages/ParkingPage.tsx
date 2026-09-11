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
import { SimpleCrudPage } from "../components/SimpleCrudPage";

function kindLabel(kind: ParkingKind) {
  return kind === "puzzle" ? "Puzzle" : "Open";
}

function AdminParkingInventory() {
  const { client } = useAuth();
  const [rows, setRows] = useState<ParkingSlotDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const columns: ShColumn<ParkingSlotDto>[] = [
    {
      key: "kind",
      header: "Kind",
      render: (row) => kindLabel(row.kind),
    },
    { key: "wing", header: "Wing", render: (row) => row.wing ?? "—" },
    { key: "slot", header: "Slot", render: (row) => row.slotNumber },
    {
      key: "flat",
      header: "Assigned flat",
      render: (row) => row.flatNumber ?? "Free",
    },
  ];

  return (
    <ShPage wide>
      <ShPageHeader
        title="Parking"
        description="Society parking inventory from Manage. Assign a lot when onboarding under Add resident → Parking Details — staff do not invent slot numbers here."
      />

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

  if (staffView) return <AdminParkingInventory />;

  return (
    <SimpleCrudPage<ParkingSlotDto>
      title="Parking"
      description="Your registered vehicles. Society lots are assigned under Account → Parking Details."
      testId="parking"
      emptyLabel="No vehicles registered yet."
      createLabel="Register vehicle"
      onList={() => client.listParkingSlots()}
      onCreate={(v) =>
        client.createParkingSlot({
          slotNumber: v.slotNumber,
          vehicleNumber: v.vehicleNumber || null,
          type: v.type || "car",
        })
      }
      fields={[
        { name: "vehicleNumber", label: "Vehicle number", required: true },
        { name: "type", label: "Type (car/bike)" },
        { name: "slotNumber", label: "Preferred slot", placeholder: "Optional" },
      ]}
      columns={[
        { key: "vehicle", label: "Vehicle", render: (r) => r.vehicleNumber ?? "—" },
        { key: "type", label: "Type", render: (r) => r.type },
        { key: "slot", label: "Slot", render: (r) => r.slotNumber },
      ]}
    />
  );
}
