import { useEffect, useState } from "react";
import type { NotificationDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";

export function NotificationsPage() {
  const { client } = useAuth();
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    client
      .listNotifications()
      .then((rows) => setItems(rows.items))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
  }

  useEffect(load, [client]);

  async function markRead(id: string) {
    try {
      await client.markNotificationRead(id);
      load();
    } catch {
      // best effort
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl">Notifications</h1>
        <p className="mt-1 text-sm text-black/55">System and society activity notifications.</p>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Notifications API isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="notifications-empty">You're all caught up.</div>
      ) : (
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
      )}
    </div>
  );
}
