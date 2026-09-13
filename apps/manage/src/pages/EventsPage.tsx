import type { EventDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { SimpleCrudPage } from "../components/SimpleCrudPage";

export function EventsPage() {
  const { client } = useAuth();
  return (
    <SimpleCrudPage<EventDto>
      title="Events"
      description="Society events and celebrations calendar."
      testId="events"
      emptyLabel="No events scheduled yet."
      createLabel="Add event"
      onList={() => client.listEvents().then(p => p.items)}
      onCreate={(v) =>
        client.createEvent({
          title: v.title,
          description: v.description || null,
          startAt: v.startAt || null,
          endAt: v.endAt || null,
          location: v.location || null,
        })
      }
      fields={[
        { name: "title", label: "Title", required: true },
        { name: "startAt", label: "Starts", type: "datetime-local" },
        { name: "endAt", label: "Ends", type: "datetime-local" },
        { name: "location", label: "Location" },
        { name: "description", label: "Description", type: "textarea" },
      ]}
      columns={[
        { key: "title", label: "Event", render: (r) => r.title },
        {
          key: "when",
          label: "When",
          render: (r) => (r.startAt ? new Date(r.startAt).toLocaleString() : "—"),
        },
        { key: "location", label: "Location", render: (r) => r.location ?? "—" },
      ]}
    />
  );
}
