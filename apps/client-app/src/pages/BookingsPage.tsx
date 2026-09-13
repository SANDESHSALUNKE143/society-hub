import { FormEvent, useEffect, useState } from "react";
import type { BookingDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { useAppMode } from "../app-mode";

export function BookingsPage() {
  const { client } = useAuth();
  const { mode } = useAppMode();
  const isAdmin = mode === "admin";
  const [items, setItems] = useState<BookingDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ facilityName: "", startAt: "", endAt: "" });

  function load() {
    client
      .listBookings()
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
      await client.createBooking(form);
      setForm({ facilityName: "", startAt: "", endAt: "" });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to book");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: "confirmed" | "cancelled") {
    try {
      await client.updateBookingStatus(id, status);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Update failed");
    }
  }

  return (
    <div data-testid="bookings-page">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="font-display text-xl sm:text-2xl">Clubhouse bookings</h1>
          <p className="mt-0.5 text-sm text-black/55">
            {isAdmin ? "Confirm or cancel facility requests." : "Request a slot; staff will confirm."}
          </p>
        </div>
        <button type="button" className="btn btn-primary text-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New booking"}
        </button>
      </div>

      {showForm && (
        <form className="card sh-section mb-4 grid gap-2.5 sm:grid-cols-2" onSubmit={submit}>
          <div className="sm:col-span-2">
            <label className="label">Facility</label>
            <input className="input" required placeholder="Clubhouse hall" value={form.facilityName} onChange={(e) => setForm((f) => ({ ...f, facilityName: e.target.value }))} />
          </div>
          <div>
            <label className="label">Start</label>
            <input className="input" type="datetime-local" required value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} />
          </div>
          <div>
            <label className="label">End</label>
            <input className="input" type="datetime-local" required value={form.endAt} onChange={(e) => setForm((f) => ({ ...f, endAt: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={busy} type="submit">Request</button>
          </div>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state">No bookings yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="bookings-table">
            <thead>
              <tr>
                <th>Facility</th>
                <th>When</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>{r.facilityName}</td>
                  <td className="text-sm">
                    {new Date(r.startAt).toLocaleString()} → {new Date(r.endAt).toLocaleString()}
                  </td>
                  <td><span className="badge">{r.status}</span></td>
                  {isAdmin && (
                    <td className="space-x-2">
                      {r.status === "pending" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(r.id, "confirmed")}>Confirm</button>
                      )}
                      {r.status !== "cancelled" && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStatus(r.id, "cancelled")}>Cancel</button>
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
