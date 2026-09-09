import { FormEvent, useEffect, useState } from "react";
import type { BillDto, PaymentAccountDto, PaymentDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const statusClass: Record<string, string> = {
  paid: "badge-success",
  void: "badge-danger",
  corrected: "badge-danger",
};

function StaffBillsView() {
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

function accessToken() {
  return localStorage.getItem("sh_web_access") ?? "";
}

function ResidentBillsView() {
  const { client } = useAuth();
  const [items, setItems] = useState<BillDto[] | null>(null);
  const [payments, setPayments] = useState<PaymentDto[]>([]);
  const [account, setAccount] = useState<PaymentAccountDto | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [payBillId, setPayBillId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    client
      .myBills()
      .then((rows) => setItems(rows))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
    client.myPayments().then(setPayments).catch(() => setPayments([]));
    client.getPaymentAccount().then(setAccount).catch(() => setAccount(null));
  }

  useEffect(load, [client]);

  async function submitProof(bill: BillDto) {
    if (!proofFile) {
      setError("Upload a screenshot of your UPI / bank payment.");
      return;
    }
    setPaying(bill.id);
    setError(null);
    setMessage(null);
    try {
      await client.submitOfflinePayment(bill.id, proofFile);
      setMessage(`Screenshot sent for ${bill.periodYm}. Admin will review and credit your bill.`);
      setPayBillId(null);
      setProofFile(null);
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not submit payment");
    } finally {
      setPaying(null);
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl">Bills</h1>
        <p className="mt-1 text-sm text-black/55">
          Pay using the society UPI / QR, then upload a screenshot. Admin credits the bill after review.
          Online Razorpay pay is coming later.
        </p>
      </div>

      {message && <p className="mb-4 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Billing isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="bills-empty">No bills yet.</div>
      ) : (
        <div className="space-y-3" data-testid="bills-list">
          {items.map((b) => {
            const pending = payments.find((p) => p.billId === b.id && p.status === "pending");
            const open = b.status !== "paid" && b.status !== "void" && b.status !== "corrected";
            const showPay = payBillId === b.id;
            return (
              <div key={b.id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{b.periodYm}</p>
                    <p className="text-sm text-black/55">{rupees(b.amountPaise)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`badge ${b.status === "paid" ? "badge-success" : ""}`}>
                      {pending ? "awaiting review" : b.status}
                    </span>
                    {open && !pending && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        data-testid="bills-pay"
                        onClick={() => {
                          setPayBillId(showPay ? null : b.id);
                          setProofFile(null);
                          setError(null);
                        }}
                      >
                        {showPay ? "Cancel" : "Pay offline"}
                      </button>
                    )}
                  </div>
                </div>
                {pending && (
                  <p className="text-sm text-black/55">
                    Screenshot submitted. Admin will review and credit this bill.
                  </p>
                )}
                {showPay && open && !pending && (
                  <div className="space-y-3 border-t border-[var(--sand)] pt-3" data-testid="bills-offline-pay">
                    {account?.upiId || account?.accountName || account?.qrUrl ? (
                      <div className="text-sm">
                        <p className="font-medium">Pay to the society account</p>
                        {account.upiId && <p>UPI: {account.upiId}</p>}
                        {account.accountName && <p>Name: {account.accountName}</p>}
                        {account.accountNumber && <p>Account: {account.accountNumber}</p>}
                        {account.ifsc && <p>IFSC: {account.ifsc}</p>}
                        {account.qrUrl && (
                          <img
                            alt="Society UPI QR"
                            className="mt-2 h-40 w-40 rounded-lg border border-[var(--sand)] object-contain bg-white"
                            src={`${account.qrUrl}?access_token=${accessToken()}`}
                          />
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--alert)]">
                        Society has not published UPI / QR details yet. Ask the office, then upload your screenshot here.
                      </p>
                    )}
                    <div>
                      <label className="label" htmlFor={`proof-${b.id}`}>
                        Payment screenshot
                      </label>
                      <input
                        id={`proof-${b.id}`}
                        data-testid="bills-proof-file"
                        className="input"
                        type="file"
                        accept="image/*"
                        onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      data-testid="bills-proof-submit"
                      disabled={paying === b.id}
                      onClick={() => submitProof(b)}
                    >
                      {paying === b.id ? "Submitting…" : "Submit for review"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BillsPage() {
  const { user } = useAuth();
  const { mode } = useAppMode();
  const staffView = canUseAdminMode(user?.role) && mode === "admin";
  return staffView ? <StaffBillsView /> : <ResidentBillsView />;
}
