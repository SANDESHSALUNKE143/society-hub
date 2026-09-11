import { FormEvent, useEffect, useState } from "react";
import type { BillDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const statusClass: Record<string, string> = {
  paid: "badge-success",
  void: "badge-danger",
  corrected: "badge-danger",
};

export function BillsPage() {
  const { client } = useAuth();
  const [items, setItems] = useState<BillDto[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [periodYm, setPeriodYm] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("2500");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    client
      .listBills()
      .then((res) => setItems(res.items))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
  }

  useEffect(load, [client]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await client.generateBills({
        periodYm,
        amountPaise: Math.round(Number(amount) * 100),
        reason: "Monthly maintenance",
        notes: notes || undefined,
      });
      setMessage(`Generated ${res.created} bill(s) for ${periodYm}.`);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to generate bills");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Bills</h1>
          <p className="mt-1 text-sm text-black/55">Maintenance bills issued per flat, per period.</p>
        </div>
        <button
          type="button"
          data-testid="bills-generate-toggle"
          className="btn btn-primary text-sm"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? "Cancel" : "Generate bills"}
        </button>
      </div>

      {showForm && (
        <form className="card mb-6 grid gap-4 p-5 sm:grid-cols-3" data-testid="bills-generate-form" onSubmit={generate}>
          <div>
            <label className="label" htmlFor="periodYm">Period (YYYY-MM)</label>
            <input
              id="periodYm"
              className="input"
              value={periodYm}
              onChange={(e) => setPeriodYm(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="amount">Amount per flat (₹)</label>
            <input
              id="amount"
              className="input"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="notes">Notes (optional)</label>
            <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <button className="btn btn-primary" data-testid="bills-generate-submit" disabled={busy} type="submit">
              Generate for all flats
            </button>
          </div>
        </form>
      )}

      {message && <p className="mb-4 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Billing API isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="bills-empty">No bills issued yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="bills-table">
            <thead>
              <tr>
                <th>Flat</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.id}>
                  <td>{b.flatNumber}</td>
                  <td>{b.periodYm}</td>
                  <td>{rupees(b.amountPaise)}</td>
                  <td>
                    <span className={`badge ${statusClass[b.status] ?? ""}`}>{b.status}</span>
                  </td>
                  <td className="text-black/55">{b.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
