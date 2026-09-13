import type { ParkingSlotDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { SimpleCrudPage } from "../components/SimpleCrudPage";

export function ParkingPage() {
  const { client } = useAuth();
  return (
    <SimpleCrudPage<ParkingSlotDto>
      title="Parking"
      description="Track parking slots and assigned vehicles."
      testId="parking"
      emptyLabel="No parking slots added yet."
      createLabel="Add slot"
      onList={() => client.listParkingSlots().then(p => p.items)}
      onCreate={(v) =>
        client.createParkingSlot({
          slotNumber: v.slotNumber,
          vehicleNumber: v.vehicleNumber || null,
          type: v.type || "car",
        })
      }
      fields={[
        { name: "slotNumber", label: "Slot number", required: true },
        { name: "vehicleNumber", label: "Vehicle number" },
        { name: "type", label: "Type (car/bike)" },
      ]}
      columns={[
        { key: "slot", label: "Slot", render: (r) => r.slotNumber },
        { key: "vehicle", label: "Vehicle", render: (r) => r.vehicleNumber ?? "Unassigned" },
        { key: "type", label: "Type", render: (r) => r.type },
        { key: "flat", label: "Flat", render: (r) => r.flatNumber ?? "—" },
      ]}
    />
  );
}
