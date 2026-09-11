import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { FlatDto, PaymentAccountDto, PaymentDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { WingFlatSelect } from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";

function accessToken() {
  return localStorage.getItem("sh_web_access") ?? "";
}

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function paymentStatusLabel(status: string) {
  if (status === "pending") return "Awaiting review";
  if (status === "success") return "Credited";
  if (status === "failed") return "Rejected";
  return status;
}

function paymentStatusClass(status: string) {
  if (status === "success") return "badge-success";
  if (status === "failed") return "badge-danger";
  if (status === "pending") return "badge-progress";
  return "";
}

function accountIsReady(account: PaymentAccountDto | null) {
  if (!account) return false;
  return Boolean(account.upiId?.trim() || account.qrUrl || account.accountNumber?.trim());
}

function AccountPreview({ account }: { account: PaymentAccountDto }) {
  return (
    <div className="rounded-lg border border-[var(--sand)] bg-white/70 p-4 text-sm" data-testid="payments-account-preview">
      <p className="font-medium text-[var(--leaf-dark)]">What residents see</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="text-black/45">UPI</dt>
          <dd>{account.upiId?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-black/45">Account name</dt>
          <dd>{account.accountName?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-black/45">Account number</dt>
          <dd>{account.accountNumber?.trim() || "—"}</dd>
        </div>
        <div>
          <dt className="text-black/45">IFSC</dt>
          <dd>{account.ifsc?.trim() || "—"}</dd>
        </div>
      </dl>
      {account.qrUrl && (
        <img
          alt="Society UPI QR"
          className="mt-3 h-28 w-28 rounded-lg border border-[var(--sand)] bg-white object-contain"
          src={`${account.qrUrl}?access_token=${accessToken()}`}
        />
      )}
    </div>
  );
}

function StaffPaymentsView() {
  const { client } = useAuth();
  const [items, setItems] = useState<PaymentDto[] | null>(null);
  const [flats, setFlats] = useState<FlatDto[]>([]);
  const [account, setAccount] = useState<PaymentAccountDto | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [editAccount, setEditAccount] = useState(false);
  const [flatId, setFlatId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [upiId, setUpiId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = useMemo(
    () => (items ?? []).filter((p) => p.status === "pending"),
    [items],
  );
  const history = useMemo(
    () => (items ?? []).filter((p) => p.status !== "pending"),
    [items],
  );
  const ready = accountIsReady(account);

  function applyAccount(a: PaymentAccountDto) {
    setAccount(a);
    setUpiId(a.upiId ?? "");
    setAccountName(a.accountName ?? "");
    setAccountNumber(a.accountNumber ?? "");
    setIfsc(a.ifsc ?? "");
  }

  function load() {
    client
      .listPayments()
      .then((res) => setItems(res.items))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
    client
      .getPaymentAccount()
      .then((a) => {
        applyAccount(a);
        if (!accountIsReady(a)) setEditAccount(true);
      })
      .catch(() => setAccount(null));
    client.listFlats().then(setFlats).catch(() => setFlats([]));
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
      applyAccount(next);
      setEditAccount(false);
      setMessage("Pay details saved. Residents will see these when they pay a bill.");
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
      applyAccount(next);
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
        setMessage("Payment credited and bill marked paid.");
      } else {
        await client.rejectPayment(id, rejectNote.trim() || null);
        setMessage("Payment rejected. The resident can submit another screenshot.");
        setRejectId(null);
        setRejectNote("");
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
      setMessage("Cash / bank payment recorded.");
      setShowRecord(false);
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
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h1 className="font-display text-2xl">Payments</h1>
          <p className="mt-1 text-sm text-black/55">
            Review UPI screenshots from residents, credit the matching bill, or record cash and
            bank payments taken at the office.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/bills" className="btn btn-ghost text-sm">
            View bills
          </Link>
          <button
            type="button"
            data-testid="payments-record-toggle"
            className="btn btn-primary text-sm"
            onClick={() => setShowRecord((s) => !s)}
          >
            {showRecord ? "Cancel" : "Record cash / bank"}
          </button>
        </div>
      </div>

      {message && <p className="text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="text-sm text-[var(--alert)]">
          Payments API isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {!ready && (
        <p className="rounded-lg border border-[var(--alert)]/30 bg-[color-mix(in_srgb,var(--alert)_8%,transparent)] px-4 py-3 text-sm text-[var(--leaf-dark)]">
          Residents cannot pay offline until you publish a UPI ID or QR below.
        </p>
      )}

      <section aria-labelledby="payments-review-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="payments-review-heading" className="font-display text-lg">
            Needs review
            {pending.length > 0 && (
              <span className="ml-2 align-middle text-sm font-sans font-semibold text-[var(--saffron)]">
                {pending.length}
              </span>
            )}
          </h2>
          <p className="text-sm text-black/50">Open the screenshot, then credit or reject.</p>
        </div>

        {items === null ? (
          <p className="text-sm text-black/50">Loading…</p>
        ) : pending.length === 0 ? (
          <div className="empty-state" data-testid="payments-pending-empty">
            No screenshots waiting. When a resident pays via UPI and uploads proof, it appears here.
          </div>
        ) : (
          <div className="space-y-3" data-testid="payments-pending">
            {pending.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-[var(--sand)] bg-[#fffdfb] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-1 gap-3">
                    {p.proofUrl ? (
                      <a
                        href={`${p.proofUrl}?access_token=${accessToken()}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0"
                      >
                        <img
                          alt="Payment screenshot"
                          className="h-24 w-24 rounded-lg border border-[var(--sand)] object-cover"
                          src={`${p.proofUrl}?access_token=${accessToken()}`}
                        />
                      </a>
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-[var(--sand)] text-xs text-black/40">
                        No image
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold">Flat {p.flatNumber ?? "—"}</p>
                      <p className="mt-0.5 text-sm text-black/60">
                        {rupees(p.amountPaise)} · UPI proof · {formatWhen(p.createdAt)}
                      </p>
                      {p.proofUrl && (
                        <a
                          className="mt-1 inline-block text-sm text-[var(--leaf)] underline-offset-2 hover:underline"
                          href={`${p.proofUrl}?access_token=${accessToken()}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open full screenshot
                        </a>
                      )}
                      {rejectId === p.id && (
                        <div className="mt-3 max-w-md space-y-2">
                          <label className="label" htmlFor={`reject-note-${p.id}`}>
                            Reason for resident (optional)
                          </label>
                          <input
                            id={`reject-note-${p.id}`}
                            className="input"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="e.g. Amount unclear — please resubmit"
                          />
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm text-[var(--danger)]"
                              data-testid={`payments-reject-${p.id}`}
                              disabled={busy}
                              onClick={() => void review(p.id, "reject")}
                            >
                              Confirm reject
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => {
                                setRejectId(null);
                                setRejectNote("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {rejectId !== p.id && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        data-testid={`payments-ack-${p.id}`}
                        disabled={busy}
                        onClick={() => void review(p.id, "ack")}
                      >
                        Credit bill
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => {
                          setRejectId(p.id);
                          setRejectNote("");
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showRecord && (
        <form
          className="rounded-xl border border-[var(--sand)] bg-[#fffdfb] p-5"
          data-testid="payments-record-form"
          onSubmit={record}
        >
          <h2 className="font-semibold">Record cash / cheque / NEFT</h2>
          <p className="mt-1 text-sm text-black/55">
            Use this when someone pays at the office. Credits immediately — no screenshot review.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {flats.length > 0 ? (
              <div className="contents">
                <WingFlatSelect
                  flats={flats}
                  value={flatId}
                  onChange={setFlatId}
                  wingHtmlFor="pay-wing"
                  flatHtmlFor="pay-flat"
                  flatTestId="payments-record-flat"
                />
              </div>
            ) : (
              <div className="sm:col-span-2">
                <label className="label" htmlFor="flatId">Flat ID</label>
                <input
                  id="flatId"
                  className="input"
                  value={flatId}
                  onChange={(e) => setFlatId(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label className="label" htmlFor="amount">Amount (₹)</label>
              <input
                id="amount"
                className="input"
                type="number"
                min={0}
                step="0.01"
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
          </div>
        </form>
      )}

      <section aria-labelledby="payments-history-heading">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="payments-history-heading" className="font-display text-lg">
            Recent payments
          </h2>
        </div>
        {items === null ? (
          <p className="text-sm text-black/50">Loading…</p>
        ) : history.length === 0 && pending.length === 0 ? (
          <div className="empty-state" data-testid="payments-empty">
            No payments recorded yet.
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-black/50">Credited and rejected payments will show here.</p>
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
                {history.map((p) => (
                  <tr key={p.id}>
                    <td>{p.flatNumber ?? p.flatId}</td>
                    <td>{rupees(p.amountPaise)}</td>
                    <td className="uppercase">{p.method}</td>
                    <td>
                      <span className={`badge ${paymentStatusClass(p.status)}`}>
                        {paymentStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="text-black/55">{p.receiptNumber ?? "—"}</td>
                    <td className="text-black/55">{formatWhen(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="payments-account-heading" className="border-t border-[var(--sand)] pt-8">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="payments-account-heading" className="font-display text-lg">
              How residents pay
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Publish UPI / QR once. Residents copy these details from Bills when they pay offline.
            </p>
          </div>
          {ready && !editAccount && (
            <button
              type="button"
              className="btn btn-ghost text-sm"
              data-testid="payments-account-edit"
              onClick={() => setEditAccount(true)}
            >
              Edit details
            </button>
          )}
        </div>

        {ready && !editAccount && account ? (
          <AccountPreview account={account} />
        ) : (
          <form
            className="grid gap-4 rounded-xl border border-[var(--sand)] bg-[#fffdfb] p-5 sm:grid-cols-2"
            data-testid="payments-account-form"
            onSubmit={saveAccount}
          >
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
            <div className="sm:col-span-2">
              <label className="label" htmlFor="qrFile">QR code (optional)</label>
              <div className="flex flex-wrap items-start gap-4">
                <input
                  id="qrFile"
                  data-testid="payments-qr-file"
                  className="input max-w-md"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void uploadQr(e.target.files?.[0] ?? null)}
                />
                {account?.qrUrl && (
                  <img
                    alt="Society QR"
                    className="h-28 w-28 rounded-lg border border-[var(--sand)] bg-white object-contain"
                    src={`${account.qrUrl}?access_token=${accessToken()}`}
                  />
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <button className="btn btn-primary" data-testid="payments-account-save" disabled={busy} type="submit">
                Save pay details
              </button>
              {ready && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => {
                    if (account) applyAccount(account);
                    setEditAccount(false);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function ResidentPaymentsView() {
  const { client } = useAuth();
  const [items, setItems] = useState<PaymentDto[] | null>(null);
  const [account, setAccount] = useState<PaymentAccountDto | null>(null);
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
    client.getPaymentAccount().then(setAccount).catch(() => setAccount(null));
  }, [client]);

  const awaiting = (items ?? []).filter((p) => p.status === "pending").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h1 className="font-display text-2xl">Payments</h1>
          <p className="mt-1 text-sm text-black/55">
            Track offline UPI submissions and office credits. Pay unpaid bills from the Bills
            screen.
          </p>
        </div>
        <Link to="/bills" className="btn btn-primary text-sm">
          Go to bills
        </Link>
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {notReady && (
        <p className="text-sm text-[var(--alert)]">
          Payment history isn't live yet — this screen will populate automatically once it is.
        </p>
      )}

      {awaiting > 0 && (
        <p className="rounded-lg border border-[var(--saffron)]/25 bg-[color-mix(in_srgb,var(--saffron)_10%,transparent)] px-4 py-3 text-sm">
          {awaiting === 1
            ? "1 payment is awaiting office review."
            : `${awaiting} payments are awaiting office review.`}
        </p>
      )}

      {accountIsReady(account) && account && (
        <section aria-labelledby="resident-pay-heading">
          <h2 id="resident-pay-heading" className="mb-2 font-display text-lg">
            Society pay details
          </h2>
          <AccountPreview account={account} />
        </section>
      )}

      <section aria-labelledby="resident-history-heading">
        <h2 id="resident-history-heading" className="mb-3 font-display text-lg">
          Your payment history
        </h2>
        {items === null ? (
          <p className="text-sm text-black/50">Loading…</p>
        ) : items.length === 0 ? (
          <div className="empty-state" data-testid="payments-empty">
            No payments yet. Open Bills, pay via UPI, then upload your screenshot.
          </div>
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
                    <td className="text-black/55">{formatWhen(p.createdAt)}</td>
                    <td>{rupees(p.amountPaise)}</td>
                    <td className="uppercase">{p.method}</td>
                    <td>
                      <span className={`badge ${paymentStatusClass(p.status)}`}>
                        {paymentStatusLabel(p.status)}
                      </span>
                      {p.status === "failed" && p.reviewNote && (
                        <p className="mt-1 max-w-[14rem] text-xs font-normal normal-case tracking-normal text-black/55">
                          {p.reviewNote}
                        </p>
                      )}
                    </td>
                    <td className="text-black/55">{p.receiptNumber ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function PaymentsPage() {
  const { user } = useAuth();
  const { mode } = useAppMode();
  const staffView = canUseAdminMode(user?.role) && mode === "admin";
  return staffView ? <StaffPaymentsView /> : <ResidentPaymentsView />;
}
