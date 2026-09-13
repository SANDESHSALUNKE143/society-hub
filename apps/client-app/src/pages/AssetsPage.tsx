import { FormEvent, useEffect, useState } from "react";
import type { AssetDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { Navigate } from "react-router-dom";
import { useAppMode } from "../app-mode";

export function AssetsPage() {
  const { client } = useAuth();
  const { mode } = useAppMode();
  const [items, setItems] = useState<AssetDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", location: "", nextServiceAt: "", notes: "" });

  function load() {
    client.listAssets().then((p) => setItems(p.items)).catch((e) => {
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
      await client.createAsset({
        name: form.name,
        category: form.category || null,
        location: form.location || null,
        nextServiceAt: form.nextServiceAt || null,
        notes: form.notes || null,
      });
      setShowForm(false);
      setForm({ name: "", category: "", location: "", nextServiceAt: "", notes: "" });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl">Assets</h1>
          <p className="text-sm text-black/55">Society asset register</p>
        </div>
        <button type="button" className="btn btn-primary text-sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "Add asset"}
        </button>
      </div>
      {showForm && (
        <form className="card mb-4 grid gap-2 sm:grid-cols-2" onSubmit={submit}>
          <div><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div><label className="label">Category</label><input className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} /></div>
          <div><label className="label">Location</label><input className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
          <div><label className="label">Next service</label><input className="input" type="datetime-local" value={form.nextServiceAt} onChange={(e) => setForm((f) => ({ ...f, nextServiceAt: e.target.value }))} /></div>
          <div className="sm:col-span-2"><button className="btn btn-primary" type="submit">Save</button></div>
        </form>
      )}
      {error && <p className="mb-2 text-sm text-[var(--danger)]">{error}</p>}
      {items === null ? <p>Loading…</p> : items.length === 0 ? (
        <div className="empty-state">No assets yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Category</th><th>Location</th><th>Next service</th></tr></thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.category ?? "—"}</td>
                  <td>{a.location ?? "—"}</td>
                  <td>{a.nextServiceAt ? new Date(a.nextServiceAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
