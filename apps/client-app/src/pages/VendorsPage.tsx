import { FormEvent, useEffect, useState } from "react";
import type { VendorDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useAppMode } from "../app-mode";

export function VendorsPage() {
  const { client } = useAuth();
  const { mode } = useAppMode();
  const [items, setItems] = useState<VendorDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", phone: "", email: "", notes: "" });

  function load() {
    client.listVendors().then((p) => setItems(p.items)).catch((e) => {
      setItems([]);
      setError(e instanceof Error ? e.message : "Failed");
    });
  }
  useEffect(() => {
    if (mode === "admin") load();
  }, [client, mode]);

  if (mode !== "admin") return <Navigate to="/dashboard" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await client.createVendor({
        name: form.name,
        category: form.category || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl">Vendors</h1>
          <p className="text-sm text-black/55">Service provider directory</p>
        </div>
        <button type="button" className="btn btn-primary text-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add vendor"}
        </button>
      </div>
      {showForm && (
        <form className="card mb-4 grid gap-2 sm:grid-cols-2" onSubmit={submit}>
          <div><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Category</label><input className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          <div className="sm:col-span-2"><button className="btn btn-primary" type="submit">Save</button></div>
        </form>
      )}
      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
      {items === null ? <p>Loading…</p> : items.length === 0 ? (
        <div className="empty-state">No vendors yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Category</th><th>Phone</th><th>Email</th></tr></thead>
            <tbody>
              {items.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.category ?? "—"}</td>
                  <td>{v.phone ?? "—"}</td>
                  <td>{v.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
