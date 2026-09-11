import { FormEvent, useEffect, useMemo, useState } from "react";
import type { BillDto, FlatDto, PaymentAccountDto, PaymentDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

const BILL_REASON_OPTIONS = [
  "Monthly maintenance",
  "Special assessment",
  "Parking charges",
  "Water / utility charges",
  "Sinking fund",
  "Other",
] as const;

function formatIssuedAt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const statusClass: Record<string, string> = {
  paid: "badge-success",
  success: "badge-success",
  void: "badge-danger",
  corrected: "badge-danger",
  failed: "badge-danger",
  pending: "badge-progress",
};

function canVoidOrCorrect(status: string) {
  return status === "draft" || status === "issued";
}

type BillDetailDialogProps = {
  billId: string;
  staffActions?: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

function BillDetailDialog({ billId, staffActions, onClose, onChanged }: BillDetailDialogProps) {
  const { client } = useAuth();
  const [bill, setBill] = useState<BillDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function reload() {
    return client.getBill(billId).then(setBill);
  }

  useEffect(() => {
    let cancelled = false;
    setBill(null);
    setError(null);
    setMessage(null);
    client
      .getBill(billId)
      .then((row) => {
        if (!cancelled) setBill(row);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiClientError ? err.body.message : "Failed to load bill");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, billId]);

  async function setStatus(corrected: boolean) {
    if (!bill) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await client.deleteBill(bill.id, { corrected });
      onChanged?.();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not update bill");
    } finally {
      setBusy(false);
    }
  }

  async function notifyResidents() {
    if (!bill) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await client.notifyBill(bill.id);
      setMessage(
        res.notified === 1
          ? "Notified 1 resident."
          : `Notified ${res.notified} residents.`,
      );
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not send notification");
    } finally {
      setBusy(false);
    }
  }

  const canNotify =
    staffActions &&
    bill &&
    bill.status !== "void" &&
    bill.status !== "corrected" &&
    Boolean(bill.owner || (bill.occupants?.length ?? 0) > 0);

  const ownerLabel = bill?.owner
    ? bill.owner.name?.trim() || bill.owner.phone || "Unnamed"
    : null;

  return (
    <div
      className="sh-dialog-backdrop"
      data-testid="bills-detail-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bills-detail-title"
        className="sh-dialog"
        data-testid="bills-detail-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="bills-detail-title" className="font-display text-xl">
              {bill ? `Bill · ${bill.periodYm}` : "Bill"}
            </h2>
            {bill && (
              <p className="mt-1 text-sm text-black/55">
                Flat {bill.flatNumber}
                {ownerLabel ? ` · ${ownerLabel}` : ""} · {rupees(bill.amountPaise)}
              </p>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" data-testid="bills-detail-close" onClick={onClose}>
            Close
          </button>
        </div>

        {message && <p className="mb-3 text-sm text-[var(--leaf)]">{message}</p>}
        {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}

        {!bill && !error ? (
          <p className="text-sm text-black/50">Loading…</p>
        ) : bill ? (
          <div className="space-y-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-black/45">Status</dt>
                <dd className="mt-0.5">
                  <span className={`badge ${statusClass[bill.status] ?? ""}`}>{bill.status}</span>
                </dd>
              </div>
              <div>
                <dt className="text-black/45">Issued</dt>
                <dd className="mt-0.5">{formatIssuedAt(bill.createdAt)}</dd>
              </div>
              <div className="sm:col-span-2" data-testid="bills-detail-owner">
                <dt className="text-black/45">Owner</dt>
                <dd className="mt-0.5">
                  {bill.owner ? (
                    <div className="space-y-1">
                      <p className="font-medium">{bill.owner.name?.trim() || "Unnamed"}</p>
                      <p className="text-black/70">
                        <span className="text-black/45">Phone · </span>
                        {bill.owner.phone ? (
                          <a className="underline-offset-2 hover:underline" href={`tel:${bill.owner.phone}`}>
                            {bill.owner.phone}
                          </a>
                        ) : (
                          <span className="text-black/45">Not on file</span>
                        )}
                      </p>
                      <p className="text-black/70">
                        <span className="text-black/45">Email · </span>
                        {bill.owner.email ? (
                          <a className="underline-offset-2 hover:underline" href={`mailto:${bill.owner.email}`}>
                            {bill.owner.email}
                          </a>
                        ) : (
                          <span className="text-black/45">Not on file</span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <span className="text-black/55">No owner linked</span>
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2" data-testid="bills-detail-occupants">
                <dt className="text-black/45">Other occupants</dt>
                <dd className="mt-0.5 text-black/80">
                  {(bill.occupants?.length ?? 0) === 0
                    ? "—"
                    : bill.occupants!.map((o) => {
                        const name = o.name?.trim() || "Unnamed";
                        const bits = [name];
                        if (o.phone) bits.push(o.phone);
                        if (o.email) bits.push(o.email);
                        return bits.join(" · ");
                      }).join("; ")}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-black/45">Notes</dt>
                <dd className="mt-0.5 text-black/80">{bill.notes?.trim() ? bill.notes : "—"}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold">What this bill covers</h3>
              {(bill.lineItems?.length ?? 0) === 0 ? (
                <p className="text-sm text-black/55">No line items recorded.</p>
              ) : (
                <ul className="divide-y divide-[var(--sand)] rounded-lg border border-[var(--sand)]" data-testid="bills-detail-lines">
                  {bill.lineItems!.map((li) => (
                    <li key={li.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{li.label}</span>
                      <span className="font-medium tabular-nums">{rupees(li.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Payments</h3>
              {(bill.payments?.length ?? 0) === 0 ? (
                <p className="text-sm text-black/55" data-testid="bills-detail-no-payments">
                  No payments linked yet.
                </p>
              ) : (
                <ul className="space-y-2" data-testid="bills-detail-payments">
                  {bill.payments!.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg border border-[var(--sand)] px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {p.method.toUpperCase()} · {rupees(p.amountPaise)}
                        </span>
                        <span className={`badge ${statusClass[p.status] ?? ""}`}>{p.status}</span>
                      </div>
                      {p.receiptNumber && (
                        <p className="mt-1 text-black/55">Receipt {p.receiptNumber}</p>
                      )}
                      {p.reviewNote && (
                        <p className="mt-1 text-black/55">{p.reviewNote}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {staffActions && (
              <div className="flex flex-wrap gap-2 border-t border-[var(--sand)] pt-4">
                {canNotify && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    data-testid="bills-detail-notify"
                    disabled={busy}
                    onClick={() => void notifyResidents()}
                  >
                    Notify residents
                  </button>
                )}
                {canVoidOrCorrect(bill.status) && (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-[var(--danger)]"
                      data-testid="bills-detail-void"
                      disabled={busy}
                      onClick={() => setStatus(false)}
                    >
                      Void bill
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      data-testid="bills-detail-correct"
                      disabled={busy}
                      onClick={() => setStatus(true)}
                    >
                      Mark corrected
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StaffBillsView() {
  const { client } = useAuth();
  const [items, setItems] = useState<BillDto[] | null>(null);
  const [flats, setFlats] = useState<FlatDto[]>([]);
  const [notReady, setNotReady] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [periodYm, setPeriodYm] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("2500");
  const [reason, setReason] = useState("Monthly maintenance");
  const [customReason, setCustomReason] = useState("");
  const [notes, setNotes] = useState("");
  const [flatScope, setFlatScope] = useState<"all" | "selected">("all");
  const [selectedFlatIds, setSelectedFlatIds] = useState<string[]>([]);
  const [flatFilter, setFlatFilter] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  function load() {
    client
      .listBills()
      .then((res) => setItems(res.items))
      .catch((err) => {
        setItems([]);
        if (err instanceof ApiClientError && err.status === 404) setNotReady(true);
        else setError(err instanceof Error ? err.message : "Failed to load");
      });
    client.listFlats().then(setFlats).catch(() => setFlats([]));
  }

  useEffect(load, [client]);

  const sortedFlats = useMemo(() => {
    return [...flats].sort((a, b) => {
      const wa = (a.wingName ?? "").localeCompare(b.wingName ?? "", undefined, { numeric: true });
      if (wa !== 0) return wa;
      return a.number.localeCompare(b.number, undefined, { numeric: true });
    });
  }, [flats]);

  const filteredFlats = useMemo(() => {
    const q = flatFilter.trim().toLowerCase();
    if (!q) return sortedFlats;
    return sortedFlats.filter((f) => {
      const label = `${f.wingName ?? ""} ${f.number}`.toLowerCase();
      return label.includes(q);
    });
  }, [sortedFlats, flatFilter]);

  function openGenerate() {
    setPeriodYm(new Date().toISOString().slice(0, 7));
    setAmount("2500");
    setReason("Monthly maintenance");
    setCustomReason("");
    setNotes("");
    setFlatScope("all");
    setSelectedFlatIds([]);
    setFlatFilter("");
    setFormError(null);
    setShowGenerate(true);
  }

  function toggleFlat(id: string) {
    setSelectedFlatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function generate(e: FormEvent) {
    e.preventDefault();
    const resolvedReason =
      reason === "Other" ? customReason.trim() : reason.trim();
    if (!resolvedReason) {
      setFormError("Choose a reason, or enter one for Other.");
      return;
    }
    if (flatScope === "selected" && selectedFlatIds.length === 0) {
      setFormError("Select at least one flat, or choose All flats.");
      return;
    }
    const amountPaise = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise < 1) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    setBusy(true);
    setFormError(null);
    setError(null);
    setMessage(null);
    try {
      const res = await client.generateBills({
        periodYm,
        amountPaise,
        reason: resolvedReason,
        notes: notes.trim() || undefined,
        flatIds: flatScope === "selected" ? selectedFlatIds : undefined,
      });
      setMessage(
        res.created === 0
          ? `No new bills for ${periodYm} — selected flats may already have a bill this period.`
          : `Generated ${res.created} bill(s) for ${periodYm}.`,
      );
      setShowGenerate(false);
      load();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.body.message : "Failed to generate bills");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h1 className="font-display text-2xl">Bills</h1>
          <p className="mt-1 text-sm text-black/55">
            Issue monthly maintenance for every flat or selected flats. Open a row to see what was
            charged, notes, and payment history. Residents pay via UPI/QR — you credit those under
            Payments.
          </p>
        </div>
        <button
          type="button"
          data-testid="bills-generate-toggle"
          className="btn btn-primary text-sm"
          onClick={openGenerate}
        >
          Generate bills
        </button>
      </div>

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
                <tr
                  key={b.id}
                  className="cursor-pointer hover:bg-black/[0.03]"
                  data-testid="bills-row"
                  tabIndex={0}
                  onClick={() => setSelectedId(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(b.id);
                    }
                  }}
                >
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

      {showGenerate && (
        <div
          className="sh-dialog-backdrop"
          data-testid="bills-generate-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setShowGenerate(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bills-generate-title"
            className="sh-dialog sh-dialog-lg"
            data-testid="bills-generate-form"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="bills-generate-title" className="font-display text-xl">
                  Generate bills
                </h2>
                <p className="mt-1 text-sm text-black/55">
                  Choose the period, amount, reason, and which flats to charge. Flats that already
                  have a bill for this period are skipped.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="bills-generate-close"
                disabled={busy}
                onClick={() => setShowGenerate(false)}
              >
                Close
              </button>
            </div>

            <form className="space-y-5" onSubmit={generate}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="periodYm">Billing month</label>
                  <input
                    id="periodYm"
                    className="input"
                    type="month"
                    value={periodYm}
                    onChange={(e) => setPeriodYm(e.target.value)}
                    required
                    data-testid="bills-generate-period"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="amount">Amount per flat (₹)</label>
                  <input
                    id="amount"
                    className="input"
                    type="number"
                    min={1}
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    data-testid="bills-generate-amount"
                  />
                </div>
              </div>

              <div>
                <label className="label" htmlFor="reason">Reason / charge type</label>
                <select
                  id="reason"
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="bills-generate-reason"
                  required
                >
                  {BILL_REASON_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {reason === "Other" && (
                  <input
                    className="input mt-2"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Describe the charge"
                    required
                    data-testid="bills-generate-reason-other"
                  />
                )}
                <p className="mt-1 text-xs text-black/45">
                  Shown on the bill as the line item (e.g. “Monthly maintenance · 2026-09”).
                </p>
              </div>

              <div>
                <label className="label" htmlFor="notes">Additional notes (optional)</label>
                <textarea
                  id="notes"
                  className="input min-h-[72px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Includes sinking fund contribution for Q3"
                  data-testid="bills-generate-notes"
                />
              </div>

              <fieldset>
                <legend className="label">Flats to charge</legend>
                <div className="mt-1 flex flex-wrap gap-4 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="flatScope"
                      checked={flatScope === "all"}
                      onChange={() => setFlatScope("all")}
                      data-testid="bills-generate-flats-all"
                    />
                    All flats ({flats.length})
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="flatScope"
                      checked={flatScope === "selected"}
                      onChange={() => setFlatScope("selected")}
                      data-testid="bills-generate-flats-selected"
                    />
                    Selected flats
                    {flatScope === "selected" && selectedFlatIds.length > 0
                      ? ` (${selectedFlatIds.length})`
                      : ""}
                  </label>
                </div>

                {flatScope === "selected" && (
                  <div className="mt-3 space-y-2" data-testid="bills-generate-flat-list">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className="input max-w-xs"
                        value={flatFilter}
                        onChange={(e) => setFlatFilter(e.target.value)}
                        placeholder="Filter by wing or flat"
                        data-testid="bills-generate-flat-filter"
                      />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedFlatIds(filteredFlats.map((f) => f.id))}
                      >
                        Select shown
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedFlatIds([])}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--sand)] bg-white/70 p-2">
                      {filteredFlats.length === 0 ? (
                        <p className="px-2 py-3 text-sm text-black/50">No flats match.</p>
                      ) : (
                        <ul className="space-y-1">
                          {filteredFlats.map((f) => {
                            const label = f.wingName ? `${f.wingName} · ${f.number}` : f.number;
                            return (
                              <li key={f.id}>
                                <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-black/[0.03]">
                                  <input
                                    type="checkbox"
                                    checked={selectedFlatIds.includes(f.id)}
                                    onChange={() => toggleFlat(f.id)}
                                  />
                                  <span>{label}</span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </fieldset>

              {formError && (
                <p className="text-sm text-[var(--danger)]" data-testid="bills-generate-error">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap gap-2 border-t border-[var(--sand)] pt-4">
                <button
                  className="btn btn-primary"
                  data-testid="bills-generate-submit"
                  disabled={busy}
                  type="submit"
                >
                  {busy
                    ? "Generating…"
                    : flatScope === "all"
                      ? `Generate for all flats`
                      : `Generate for ${selectedFlatIds.length || "selected"} flat(s)`}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={() => setShowGenerate(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedId && (
        <BillDetailDialog
          billId={selectedId}
          staffActions
          onClose={() => setSelectedId(null)}
          onChanged={load}
        />
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
          Your flat&apos;s maintenance charges by month. Open a bill for the breakdown. Pay using the
          society UPI / QR, then upload a screenshot — the office credits it after review. Online
          Razorpay pay is coming later.
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
              <div key={b.id} className="card space-y-3 p-5" data-testid="bills-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    className="text-left"
                    data-testid="bills-card-open"
                    onClick={() => setSelectedId(b.id)}
                  >
                    <p className="font-semibold">{b.periodYm}</p>
                    <p className="text-sm text-black/55">{rupees(b.amountPaise)} · View details</p>
                  </button>
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

      {selectedId && (
        <BillDetailDialog billId={selectedId} onClose={() => setSelectedId(null)} />
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
