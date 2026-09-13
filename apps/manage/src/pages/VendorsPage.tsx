import type { VendorDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { SimpleCrudPage } from "../components/SimpleCrudPage";

export function VendorsPage() {
  const { client } = useAuth();
  return (
    <SimpleCrudPage<VendorDto>
      title="Vendors"
      description="Contractors and service providers for the society."
      testId="vendors"
      emptyLabel="No vendors added yet."
      createLabel="Add vendor"
      onList={() => client.listVendors().then(p => p.items)}
      onCreate={(v) =>
        client.createVendor({
          name: v.name,
          category: v.category || null,
          phone: v.phone || null,
          email: v.email || null,
          notes: v.notes || null,
        })
      }
      fields={[
        { name: "name", label: "Vendor name", required: true },
        { name: "category", label: "Category", placeholder: "Plumber, Electrician…" },
        { name: "phone", label: "Phone" },
        { name: "email", label: "Email" },
      ]}
      columns={[
        { key: "name", label: "Vendor", render: (r) => r.name },
        { key: "category", label: "Category", render: (r) => r.category ?? "—" },
        { key: "phone", label: "Phone", render: (r) => r.phone ?? "—" },
        { key: "email", label: "Email", render: (r) => r.email ?? "—" },
      ]}
    />
  );
}
