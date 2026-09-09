import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { ComplaintDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";
import { Icon } from "../components/icons";
import {
  ComplaintListCard,
  complaintFlatLabel,
  complaintQueueLine,
  formatComplaintWhen,
} from "@society-hub/ui";

export function ComplaintsPage() {
  const { client, user } = useAuth();
  const { mode } = useAppMode();
  const staffView = canUseAdminMode(user?.role) && mode === "admin";
  const [items, setItems] = useState<ComplaintDto[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .listComplaints(1, 20, { mine: !staffView })
      .then((res) => setItems(res.items))
      .catch((err) => setError(err.message));
  }, [client, staffView]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.ticketNumber.toLowerCase().includes(q) ||
        (staffView && c.flatNumber.toLowerCase().includes(q)),
    );
  }, [items, search, staffView]);

  return (
    <div className="sh-complaint-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-[var(--leaf-dark)]">
            {staffView ? "Complaint queue" : "Complaints"}
          </h1>
          <p className="mt-1 text-sm text-black/55">
            {staffView
              ? "Acknowledge when you can — leave untouched tickets in the queue."
              : "Track ticket numbers and progress"}
          </p>
        </div>
        <Link
          to="/complaints/new"
          className="btn btn-primary rounded-full px-4"
          data-testid="new-complaint-link"
        >
          <Icon name="plus" className="h-4 w-4" />
          Raise complaint
        </Link>
      </div>

      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35"
        />
        <input
          className="input rounded-full pl-9"
          placeholder={staffView ? "Search ticket, title or flat…" : "Search your tickets…"}
          data-testid="complaints-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="text-[var(--danger)]">{error}</p>}

      {filtered.length === 0 ? (
        <div className="empty-state sh-complaint-list" data-testid="complaints-empty">
          No complaints yet.
        </div>
      ) : (
        <div className="sh-complaint-list" data-testid="complaints-list">
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
