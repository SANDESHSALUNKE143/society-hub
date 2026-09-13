import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { AuditLogDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

export function AuditPage() {
  const { client, user } = useAuth();
  const [items, setItems] = useState<AuditLogDto[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const allowed = canUseAdminMode(user?.role);

  useEffect(() => {
    if (!allowed) return;
    client
      .listAuditLogs()
      .then((rows) => setItems(rows))
      .catch((err) => {
        setItems([]);
        setError(err instanceof Error ? err.message : "Failed to load");
      });
  }, [client, allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  const filtered = (items ?? []).filter((r) =>
    q
      ? `${r.action} ${r.entityType} ${r.actorName ?? ""}`.toLowerCase().includes(q.toLowerCase())
      : true,
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Audit log</h1>
          <p className="mt-1 text-sm text-black/55">Who did what, and when.</p>
        </div>
        <input
          className="input max-w-xs"
          placeholder="Search action or entity…"
          data-testid="audit-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state" data-testid="audit-empty">No audit events yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-black/55">{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.actorName ?? r.actorUserId}</td>
                  <td>
                    <span className="badge">{r.action}</span>
                  </td>
                  <td className="text-black/55">
                    {r.entityType} · {r.entityId.slice(0, 8)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
