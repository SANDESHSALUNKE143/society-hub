import type { AssetDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { SimpleCrudPage } from "../components/SimpleCrudPage";

export function AssetsPage() {
  const { client } = useAuth();
  return (
    <SimpleCrudPage<AssetDto>
      title="Assets"
      description="Society-owned equipment and fixtures."
      testId="assets"
      emptyLabel="No assets recorded yet."
      createLabel="Add asset"
      onList={() => client.listAssets().then(p => p.items)}
      onCreate={(v) =>
        client.createAsset({
          name: v.name,
          category: v.category || null,
          location: v.location || null,
          notes: v.notes || null,
        })
      }
      fields={[
        { name: "name", label: "Asset name", required: true },
        { name: "category", label: "Category", placeholder: "Generator, Lift, CCTV…" },
        { name: "location", label: "Location" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: "Asset", render: (r) => r.name },
        { key: "category", label: "Category", render: (r) => r.category ?? "—" },
        { key: "location", label: "Location", render: (r) => r.location ?? "—" },
      ]}
    />
  );
}
