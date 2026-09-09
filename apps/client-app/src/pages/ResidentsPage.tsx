import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { SocietyResidentDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

function flatLabel(row: SocietyResidentDto) {
  return row.wingName ? `${row.wingName}-${row.flatNumber}` : row.flatNumber;
}

export function ResidentsPage() {
  const { client, user } = useAuth();
  const [items, setItems] = useState<SocietyResidentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = canUseAdminMode(user?.role);

  useEffect(() => {
    if (!allowed) return;
    client
      .listResidents()
      .then((rows) => setItems(rows))
      .catch((err) => {
        setItems([]);
        setError(errMessage(err, "Failed to load residents"));
      });
  }, [client, allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  return (
    <div data-testid="residents-page">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Residents</h1>
          <p className="mt-1 text-sm text-black/55">
            Everyone onboarded to this society. Several family members can share one
            flat — they appear as separate rows.
          </p>
        </div>
        <Link to="/onboard" className="btn btn-primary" data-testid="residents-onboard">
          Add family member
        </Link>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="residents-empty">
          No residents yet. Onboard someone to a flat.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="residents-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Flat</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.userId}>
                  <td>{row.name ?? "—"}</td>
                  <td>{row.email ?? "—"}</td>
                  <td>{row.phone ?? "—"}</td>
                  <td>{flatLabel(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
