import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import type { SocietyDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";

export function SocietiesPage() {
  const { client, user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<SocietyDto[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    pincode: "",
    chairpersonName: "",
    chairpersonEmail: "",
    chairpersonPhone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    client
      .listSocieties()
      .then((rows) => setItems(rows))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
  }

  useEffect(load, [client]);

  if (user?.role !== "superadmin") return <Navigate to="/login" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await client.createSociety({
        name: form.name,
        address: form.address || null,
        city: form.city || null,
        pincode: form.pincode || null,
        chairpersonName: form.chairpersonName || null,
        chairpersonEmail: form.chairpersonEmail || null,
        chairpersonPhone: form.chairpersonPhone || null,
      });
      setForm({
        name: "",
        address: "",
        city: "",
        pincode: "",
        chairpersonName: "",
        chairpersonEmail: "",
        chairpersonPhone: "",
      });
      setShowForm(false);
      navigate(`/societies/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to create society");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Societies</h1>
          <p className="mt-1 text-sm text-black/55">
            Every society on the SocietyHub platform. After create, set up Structure:
            Society → Towers → Wings → Flats.
          </p>
        </div>
        <button
          type="button"
          data-testid="societies-add-toggle"
          className="btn btn-primary text-sm"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? "Cancel" : "New society"}
        </button>
      </div>

      {showForm && (
        <form className="card mb-6 grid gap-4 p-5 sm:grid-cols-2" data-testid="societies-form" onSubmit={submit}>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="soc-name">Society name</label>
            <input
              id="soc-name"
              className="input"
              data-testid="societies-input-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="soc-address">Address</label>
            <input
              id="soc-address"
              className="input"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="soc-city">City</label>
            <input
              id="soc-city"
              className="input"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="soc-pincode">Pincode</label>
            <input
              id="soc-pincode"
              className="input"
              value={form.pincode}
              onChange={(e) => setForm((f) => ({ ...f, pincode: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="soc-chair-name">Chairperson name</label>
            <input
              id="soc-chair-name"
              className="input"
              value={form.chairpersonName}
              onChange={(e) => setForm((f) => ({ ...f, chairpersonName: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="soc-chair-email">Chairperson email</label>
            <input
              id="soc-chair-email"
              className="input"
              type="email"
              value={form.chairpersonEmail}
              onChange={(e) => setForm((f) => ({ ...f, chairpersonEmail: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="soc-chair-phone">Chairperson phone</label>
            <input
              id="soc-chair-phone"
              className="input"
              value={form.chairpersonPhone}
              onChange={(e) => setForm((f) => ({ ...f, chairpersonPhone: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" data-testid="societies-submit" disabled={busy} type="submit">
              Create society
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Societies API isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="societies-empty">No societies yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <Link key={s.id} to={`/societies/${s.id}`} className="card block p-5 hover:-translate-y-0.5 transition-transform">
              <h3 className="font-semibold">{s.name}</h3>
              <p className="mt-1 text-sm text-black/55">
                {[s.city, s.pincode].filter(Boolean).join(" · ") || "No location set"}
              </p>
              {s.chairpersonName && (
                <p className="mt-2 text-xs uppercase tracking-wide text-black/35">
                  Chairperson: {s.chairpersonName}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
