import type { InvitationDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { SimpleCrudPage } from "../components/SimpleCrudPage";

export function InvitesPage() {
  const { client } = useAuth();
  return (
    <SimpleCrudPage<InvitationDto>
      title="Invites"
      description="Invite an admin or resident by email or phone."
      testId="invites"
      emptyLabel="No invites sent yet."
      createLabel="Send invite"
      // The invitations endpoint is paginated now; this simple Manage list
      // shows the first page.
      onList={() =>
        client.listInvitations({ page: 1, limit: 100 }).then((res) => res.items)
      }
      onCreate={(v) =>
        client.createInvitation({
          email: v.email || null,
          phone: v.phone || null,
          role: v.role || "resident",
        })
      }
      fields={[
        { name: "email", label: "Email" },
        { name: "phone", label: "Phone" },
        { name: "role", label: "Role (admin/resident)", required: true, placeholder: "resident" },
      ]}
      columns={[
        { key: "contact", label: "Contact", render: (r) => r.email ?? r.phone ?? "—" },
        { key: "role", label: "Role", render: (r) => <span className="badge">{r.role}</span> },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span className={`badge ${r.status === "accepted" ? "badge-success" : r.status === "revoked" ? "badge-danger" : ""}`}>
              {r.status}
            </span>
          ),
        },
        { key: "sent", label: "Sent", render: (r) => new Date(r.createdAt).toLocaleDateString() },
      ]}
    />
  );
}
