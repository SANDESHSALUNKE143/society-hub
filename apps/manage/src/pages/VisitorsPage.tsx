import type { VisitorDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { SimpleCrudPage } from "../components/SimpleCrudPage";

export function VisitorsPage() {
  const { client } = useAuth();
  return (
    <SimpleCrudPage<VisitorDto>
      title="Visitors"
      description="Gate log of expected and checked-in visitors."
      testId="visitors"
      emptyLabel="No visitors logged yet."
      createLabel="Log visitor"
      onList={() => client.listVisitors().then(p => p.items)}
      onCreate={(v) =>
        client.createVisitor({
          visitorName: v.visitorName,
          phone: v.phone || null,
          purpose: v.purpose || null,
          expectedAt: v.expectedAt || null,
        })
      }
      fields={[
        { name: "visitorName", label: "Visitor name", required: true },
        { name: "phone", label: "Phone" },
        { name: "purpose", label: "Purpose" },
        { name: "expectedAt", label: "Expected at", type: "datetime-local" },
      ]}
      columns={[
        { key: "name", label: "Visitor", render: (r) => r.visitorName },
        { key: "flat", label: "Flat", render: (r) => r.flatNumber ?? "—" },
        { key: "purpose", label: "Purpose", render: (r) => r.purpose ?? "—" },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span className="badge">
              {r.checkedOutAt ? "Checked out" : r.checkedInAt ? "Checked in" : "Expected"}
            </span>
          ),
        },
      ]}
    />
  );
}
