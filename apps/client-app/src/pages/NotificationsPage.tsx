import { useEffect, useState } from "react";
import type { NotificationDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";

export function NotificationsPage() {
  const { client } = useAuth();
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  function load() {
    Promise.all([
      client.listNotifications(page, 20),
      client.notificationsUnreadCount(),
    ])
      .then(([paginated, count]) => {
        setItems(paginated.items);
        setTotal(paginated.total);
        setUnread(count.unread);
      })
      .catch((err) => {
        setItems([]);
        setError(err instanceof Error ? err.message : "Failed to load");
      });
  }

  useEffect(load, [client, page]);

  async function markRead(id: string) {
    try {
      await client.markNotificationRead(id);
      load();
    } catch {
      /* best effort */
    }
  }

  async function markAll() {
    try {
      await client.markAllNotificationsRead();
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl">Notifications</h1>
          <p className="mt-1 text-sm text-black/55">
            Updates on complaints, bills and notices
            {unread > 0 ? ` · ${unread} unread` : ""}.
          </p>
        </div>
        {unread > 0 && (
          <button type="button" className="btn btn-ghost text-sm" onClick={markAll}>
            Mark all read
          </button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="notifications-empty">You're all caught up.</div>
      ) : (
        <>
          <ul className="card divide-y divide-[var(--sand)]" data-testid="notifications-list">
            {items.map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div>
                  <p className={n.readAt ? "text-black/60" : "font-semibold"}>{n.title}</p>
                  <p className="mt-0.5 text-sm text-black/55">{n.body}</p>
                  <p className="mt-1 text-xs text-black/35">{new Date(n.createdAt).toLocaleString()}</p>
                </div>
                {!n.readAt && (
                  <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => markRead(n.id)}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
          {total > 20 && (
            <div className="mt-4 flex gap-2">
              <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
