import { FormEvent, useEffect, useState } from "react";
import type { VisitorDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { useAppMode } from "../app-mode";

export function VisitorsPage() {
  const { client } = useAuth();
  const { mode } = useAppMode();
  const isAdmin = mode === "admin";
  const [items, setItems] = useState<VisitorDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    visitorName: "",
    phone: "",
    purpose: "",
    expectedAt: "",
  });

  function load() {
    client
      .listVisitors()
      .then((page) => setItems(page.items))
      .catch((err) => {
        setItems([]);
        setError(err instanceof Error ? err.message : "Failed to load");
      });
  }

  useEffect(load, [client]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.createVisitor({
        visitorName: form.visitorName,
        phone: form.phone || null,
        purpose: form.purpose || null,
        expectedAt: form.expectedAt || null,
      });
      setForm({ visitorName: "", phone: "", purpose: "", expectedAt: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(id: string) {
    try {
      await client.checkInVisitor(id);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Check-in failed");
    }
  }

  async function checkOut(id: string) {
    try {
      await client.checkOutVisitor(id);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Check-out failed");
    }
  }

  return (
    <div data-testid="visitors-page">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-xl sm:text-2xl">Visitors</h1>
          <p className="mt-0.5 text-sm text-black/55">
            {isAdmin ? "Expected and on-site visitors — check in and out at the gate." : "Pre-register guests for your flat."}
          </p>
        </div>
        <button type="button" className="btn btn-primary text-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Expect a visitor"}
        </button>
      </div>

      {showForm && (
        <form className="card sh-section mb-4 grid gap-2.5 sm:grid-cols-2" onSubmit={submit}>
          <div>
            <label className="label">Visitor name</label>
            <input className="input" required value={form.visitorName} onChange={(e) => setForm((f) => ({ ...f, visitorName: e.target.value }))} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <label className="label">Purpose</label>
            <input className="input" value={form.purpose} onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))} />
          </div>
          <div>
            <label className="label">Expected at</label>
            <input className="input" type="datetime-local" value={form.expectedAt} onChange={(e) => setForm((f) => ({ ...f, expectedAt: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy} type="submit">Save</button>
          </div>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">No visitors yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="visitors-table">
            <thead>
              <tr>
                <th>Visitor</th>
                <th>Flat</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="font-medium">{r.visitorName}</div>
                    <div className="text-xs text-black/45">{r.purpose ?? "—"}</div>
                  </td>
                  <td>{r.flatNumber ?? "—"}</td>
                  <td>
                    <span className="badge">
                      {r.checkedOutAt ? "Checked out" : r.checkedInAt ? "On site" : "Expected"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="space-x-2">
                      {!r.checkedInAt && !r.checkedOutAt && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => checkIn(r.id)}>Check in</button>
                      )}
                      {r.checkedInAt && !r.checkedOutAt && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => checkOut(r.id)}>Check out</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
