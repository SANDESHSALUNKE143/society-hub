import { FormEvent, useEffect, useState } from "react";
import type { PaymentAccountDto, PaymentDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";

function accessToken() {
  return localStorage.getItem("sh_web_access") ?? "";
}

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function StaffPaymentsView() {
  const { client } = useAuth();
  const [items, setItems] = useState<PaymentDto[] | null>(null);
  const [account, setAccount] = useState<PaymentAccountDto | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [flatId, setFlatId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    client
      .listPayments()
      .then((res) => setItems(res.items))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
    client.getPaymentAccount().then((a) => {
      setAccount(a);
      setUpiId(a.upiId ?? "");
      setAccountName(a.accountName ?? "");
      setAccountNumber(a.accountNumber ?? "");
      setIfsc(a.ifsc ?? "");
    }).catch(() => setAccount(null));
  }

  useEffect(load, [client]);

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const next = await client.updatePaymentAccount({
        upiId: upiId || null,
        accountName: accountName || null,
        accountNumber: accountNumber || null,
        ifsc: ifsc || null,
      });
      setAccount(next);
      setMessage("Payment account saved. Residents will see this when they pay.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to save account");
    } finally {
      setBusy(false);
    }
  }

  async function uploadQr(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const next = await client.uploadPaymentQr(file);
      setAccount(next);
      setMessage("QR code uploaded.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to upload QR");
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, action: "ack" | "reject") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (action === "ack") {
        await client.acknowledgePayment(id);
        setMessage("Payment credited.");
      } else {
        await client.rejectPayment(id);
        setMessage("Payment rejected. Resident can submit again.");
      }
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }

  async function record(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await client.recordPayment({
        flatId,
        amountPaise: Math.round(Number(amount) * 100),
        method,
        receiptNumber: receiptNumber || null,
      });
      setMessage("Payment recorded.");
      setShowForm(false);
      setFlatId("");
      setAmount("");
      setReceiptNumber("");
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Payments</h1>
          <p className="mt-1 text-sm text-black/55">
            Publish UPI / QR for residents. Review screenshots and credit bills. Razorpay online pay is coming later.
          </p>
        </div>
        <button
          type="button"
          data-testid="payments-record-toggle"
          className="btn btn-primary text-sm"
          onClick={() => setShowForm((s) => !s)}
        >
          {showForm ? "Cancel" : "Record offline payment"}
        </button>
      </div>

      <form
        className="card mb-6 grid gap-4 p-5 sm:grid-cols-2"
        data-testid="payments-account-form"
        onSubmit={saveAccount}
      >
        <h2 className="font-semibold sm:col-span-2">Society account (shown to residents)</h2>
        <div>
          <label className="label" htmlFor="upiId">UPI ID</label>
          <input
            id="upiId"
            data-testid="payments-upi"
            className="input"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            placeholder="society@upi"
          />
        </div>
        <div>
          <label className="label" htmlFor="accountName">Account name</label>
          <input
            id="accountName"
            className="input"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="accountNumber">Account number (optional)</label>
          <input
            id="accountNumber"
            className="input"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="ifsc">IFSC (optional)</label>
          <input
            id="ifsc"
            className="input"
            value={ifsc}
            onChange={(e) => setIfsc(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="qrFile">QR code (optional)</label>
          <input
            id="qrFile"
            data-testid="payments-qr-file"
            className="input"
            type="file"
            accept="image/*"
            onChange={(e) => uploadQr(e.target.files?.[0] ?? null)}
          />
          {account?.qrUrl && (
            <img
              alt="Society QR"
              className="mt-2 h-28 w-28 rounded-lg border border-[var(--sand)] object-contain bg-white"
              src={`${account.qrUrl}?access_token=${accessToken()}`}
            />
          )}
        </div>
        <div className="flex items-end">
          <button className="btn btn-primary" data-testid="payments-account-save" disabled={busy} type="submit">
            Save account details
          </button>
        </div>
      </form>

      {items?.some((p) => p.status === "pending") && (
        <div className="mb-6 space-y-3" data-testid="payments-pending">
          <h2 className="font-semibold">Waiting for review</h2>
          {items
            .filter((p) => p.status === "pending")
            .map((p) => (
              <div key={p.id} className="card flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="flex gap-3">
                  {p.proofUrl && (
                    <a href={`${p.proofUrl}?access_token=${accessToken()}`} target="_blank" rel="noreferrer">
                      <img
                        alt="Payment screenshot"
                        className="h-20 w-20 rounded-lg object-cover border border-[var(--sand)]"
                        src={`${p.proofUrl}?access_token=${accessToken()}`}
                      />
                    </a>
                  )}
                  <div>
                    <p className="font-medium">{p.flatNumber ?? p.flatId}</p>
                    <p className="text-sm text-black/55">
                      {rupees(p.amountPaise)} · UPI screenshot
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    data-testid={`payments-ack-${p.id}`}
                    disabled={busy}
                    onClick={() => review(p.id, "ack")}
                  >
                    Credit & acknowledge
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    data-testid={`payments-reject-${p.id}`}
                    disabled={busy}
                    onClick={() => review(p.id, "reject")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {showForm && (
        <form className="card mb-6 grid gap-4 p-5 sm:grid-cols-2" data-testid="payments-record-form" onSubmit={record}>
          <div>
            <label className="label" htmlFor="flatId">Flat ID</label>
            <input id="flatId" className="input" value={flatId} onChange={(e) => setFlatId(e.target.value)} required />
          </div>
          <div>
            <label className="label" htmlFor="amount">Amount (₹)</label>
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
            <label className="label" htmlFor="method">Method</label>
            <select id="method" className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="neft">NEFT</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="receiptNumber">Reference / receipt no.</label>
            <input
              id="receiptNumber"
              className="input"
              value={receiptNumber}
              onChange={(e) => setReceiptNumber(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <button className="btn btn-primary" data-testid="payments-record-submit" disabled={busy} type="submit">
              Save payment
            </button>
          </div>
        </form>
      )}

      {message && <p className="mb-4 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Payments API isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="payments-empty">No payments recorded yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="payments-table">
            <thead>
              <tr>
                <th>Flat</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Reference</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>{p.flatNumber ?? p.flatId}</td>
                  <td>{rupees(p.amountPaise)}</td>
                  <td className="uppercase">{p.method}</td>
                  <td>
                    <span className={`badge ${p.status === "success" ? "badge-success" : p.status === "failed" ? "badge-danger" : ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="text-black/55">{p.receiptNumber ?? "—"}</td>
                  <td className="text-black/55">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResidentPaymentsView() {
  const { client } = useAuth();
  const [items, setItems] = useState<PaymentDto[] | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .myPayments()
      .then((rows) => setItems(rows))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
  }, [client]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl">Payments</h1>
        <p className="mt-1 text-sm text-black/55">
          Offline UPI submissions and credited payments. Pending means the office is reviewing your screenshot.
        </p>
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="mb-4 text-sm text-[var(--alert)]">
          Payment history isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {items === null ? (
        <p className="text-sm text-black/50">Loading…</p>
      ) : items.length === 0 ? (
        <div className="empty-state" data-testid="payments-empty">No payments yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table" data-testid="payments-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="text-black/55">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td>{rupees(p.amountPaise)}</td>
                  <td className="uppercase">{p.method}</td>
                  <td>
                    <span className={`badge ${p.status === "success" ? "badge-success" : p.status === "failed" ? "badge-danger" : ""}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="text-black/55">{p.receiptNumber ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function PaymentsPage() {
  const { user } = useAuth();
  const { mode } = useAppMode();
  const staffView = canUseAdminMode(user?.role) && mode === "admin";
  return staffView ? <StaffPaymentsView /> : <ResidentPaymentsView />;
}
