import { FormEvent, useEffect, useState } from "react";
import type { EventDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { useAppMode } from "../app-mode";

export function EventsPage() {
  const { client } = useAuth();
  const { mode } = useAppMode();
  const isAdmin = mode === "admin";
  const [items, setItems] = useState<EventDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", startAt: "", location: "", capacity: "" });

  function load() {
    client.listEvents().then((p) => setItems(p.items)).catch((e) => {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed");
    });
  }
  useEffect(load, [client]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    try {
      await client.createEvent({
        title: form.title,
        description: form.description || null,
        startAt: form.startAt || null,
        location: form.location || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  async function toggleRsvp(ev: EventDto) {
    try {
      if (ev.iAmGoing) await client.cancelEventRsvp(ev.id);
      else await client.rsvpEvent(ev.id);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "RSVP failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl">Events</h1>
          <p className="text-sm text-black/55">Society events and RSVPs</p>
        </div>
        {isAdmin && (
          <button type="button" className="btn btn-primary text-sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Publish event"}
          </button>
        )}
      </div>
      {showForm && isAdmin && (
        <form className="card mb-4 grid gap-2 sm:grid-cols-2" onSubmit={submit}>
          <div className="sm:col-span-2"><label className="label">Title</label><input className="input" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
          <div><label className="label">Start</label><input className="input" type="datetime-local" value={form.startAt} onChange={(e) => setForm((f) => ({ ...f, startAt: e.target.value }))} /></div>
          <div><label className="label">Capacity</label><input className="input" type="number" min={1} value={form.capacity} onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} /></div>
          <div className="sm:col-span-2"><label className="label">Location</label><input className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
          <div className="sm:col-span-2"><button className="btn btn-primary" type="submit">Publish</button></div>
        </form>
      )}
      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
      {items === null ? <p>Loading…</p> : items.length === 0 ? (
        <div className="empty-state">No events yet.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((ev) => (
            <li key={ev.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{ev.title}</p>
                <p className="text-sm text-black/55">{ev.location ?? "—"} · {ev.startAt ? new Date(ev.startAt).toLocaleString() : "TBA"}</p>
                <p className="text-xs text-black/40">RSVPs: {ev.rsvpCount ?? 0}{ev.capacity != null ? ` / ${ev.capacity}` : ""}</p>
              </div>
              <button type="button" className="btn btn-ghost text-sm" onClick={() => toggleRsvp(ev)}>
                {ev.iAmGoing ? "Cancel RSVP" : "I'm going"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
