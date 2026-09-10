import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ComplaintDto } from "@society-hub/types";
import {
  ComplaintListCard,
  complaintFlatLabel,
  complaintQueueLine,
  formatComplaintWhen,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { Icon } from "../components/icons";

export function ComplaintsPage() {
  const { client } = useAuth();
  const [items, setItems] = useState<ComplaintDto[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .listComplaints()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err.message));
  }, [client]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.ticketNumber.toLowerCase().includes(q) ||
        c.flatNumber.toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="sh-complaint-page sh-complaint-page-wide">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="sh-complaint-heading">Complaints</h1>
          <p className="mt-1 text-sm text-black/55">All society complaints — update status from detail</p>
        </div>
        <div className="relative w-full max-w-xs">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35"
          />
          <input
            className="input rounded-full pl-9"
            placeholder="Search ticket, title or flat…"
            data-testid="complaints-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="mb-4 text-[var(--danger)]">{error}</p>}

      {filtered.length === 0 ? (
        <div className="empty-state sh-complaint-list">No complaints match.</div>
      ) : (
        <div className="sh-complaint-list" data-testid="complaints-table">
          {filtered.map((c) => (
            <Link key={c.id} to={`/complaints/${c.id}`} className="block">
              <ComplaintListCard
                type={c.type}
                title={c.title}
                location={complaintFlatLabel(c.flatNumber)}
                when={formatComplaintWhen(c.createdAt)}
                ticketNumber={c.ticketNumber}
                status={c.status}
                queueLine={complaintQueueLine({
                  status: c.status,
                  queuePosition: c.queuePosition,
                  queueHint: c.queueHint,
                })}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
