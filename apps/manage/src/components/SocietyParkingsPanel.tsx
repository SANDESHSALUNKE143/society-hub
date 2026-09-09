import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { ParkingKind, ParkingSlotDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { PARKING_CSV_TEMPLATE, parseParkingCsv } from "../lib/parking-csv";
import { paginateItems } from "../lib/flat-list";
import { ConfirmDialog } from "./ConfirmDialog";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

function kindLabel(kind: ParkingKind) {
  return kind === "puzzle" ? "Puzzle" : "Open";
}

export function SocietyParkingsPanel({ societyId }: { societyId: string }) {
  const { client } = useAuth();
  const [rows, setRows] = useState<ParkingSlotDto[] | null>(null);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<ParkingKind>("puzzle");
  const [wing, setWing] = useState("A");
  const [slotNumber, setSlotNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ParkingSlotDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const paged = useMemo(() => paginateItems(rows ?? [], page), [rows, page]);

  useEffect(() => {
    setPage((current) => Math.min(current, paged.pageCount));
  }, [paged.pageCount]);

  const load = useCallback(() => {
    return client
      .listManageSocietyParkings(societyId)
      .then((list) => setRows(list))
      .catch((err) => {
        setRows([]);
        setError(errMessage(err, "Failed to load parking"));
      });
  }, [client, societyId]);

  useEffect(() => {
    void load();
  }, [load]);

  function clearForm() {
    setEditingId(null);
    setKind("puzzle");
    setWing("A");
    setSlotNumber("");
  }

  function closeDialog() {
    if (busy) return;
    setDialogOpen(false);
    clearForm();
  }

  function openAdd() {
    clearForm();
    setError(null);
    setMessage(null);
    setDialogOpen(true);
  }

  function startEdit(row: ParkingSlotDto) {
    setEditingId(row.id);
    setKind(row.kind);
    setWing(row.wing ?? "");
    setSlotNumber(row.slotNumber);
    setMessage(null);
    setError(null);
    setDialogOpen(true);
  }

  useEffect(() => {
    if (!dialogOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDialog();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [dialogOpen, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const body = {
      kind,
      wing: kind === "puzzle" ? wing.trim() : wing.trim() || null,
      slotNumber: slotNumber.trim(),
    };
    try {
      if (editingId) {
        await client.updateManageSocietyParking(societyId, editingId, body);
        setMessage("Parking updated.");
      } else {
        await client.addManageSocietyParking(societyId, body);
        setMessage("Parking added. It now appears in Client App onboard.");
      }
      clearForm();
      setDialogOpen(false);
      await load();
    } catch (err) {
      setError(errMessage(err, editingId ? "Failed to update parking" : "Failed to add parking"));
    } finally {
      setBusy(false);
    }
  }

  function askDelete(row: ParkingSlotDto) {
    setPendingDelete(row);
    setDeleteError(null);
    setError(null);
    setMessage(null);
  }

  function closeDelete() {
    if (busy) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setDeleteError(null);
    setError(null);
    setMessage(null);
    try {
      await client.deleteManageSocietyParking(societyId, pendingDelete.id);
      if (editingId === pendingDelete.id) {
        clearForm();
        setDialogOpen(false);
      }
      setPendingDelete(null);
      setMessage("Parking deleted.");
      await load();
    } catch (err) {
      setDeleteError(errMessage(err, "Failed to delete parking"));
    } finally {
      setBusy(false);
    }
  }

  async function onCsv(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const parsed = parseParkingCsv(await file.text());
      if (parsed.rows.length === 0) {
        setError(
          parsed.errors[0]?.message ?? "No valid rows. Use kind, wing, slotNumber.",
        );
        return;
      }
      const result = await client.importManageSocietyParkings(societyId, parsed.rows);
      const extra = parsed.errors.length
        ? ` CSV parse skipped ${parsed.errors.length} row(s).`
        : "";
      setMessage(
        `Created ${result.created} · Updated ${result.updated} · Unchanged ${result.skipped} · Errors ${result.errors.length}.${extra}`,
      );
      if (result.errors[0]) {
        setError(`Row ${result.errors[0].row}: ${result.errors[0].message}`);
      } else {
        setDialogOpen(false);
        clearForm();
      }
      await load();
    } catch (err) {
      setError(errMessage(err, "Failed to import parking"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="society-parkings">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Parkings</h2>
          <p className="mt-1 text-sm text-black/55">
            Puzzle parking is wing + number (A–D typical). Open parking is a
            number only. Society staff pick these when onboarding residents.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="add-parking-open"
          disabled={busy}
          onClick={openAdd}
        >
          Add parking
        </button>
      </div>

      {message && <p className="mb-2 shrink-0 text-sm text-[var(--leaf)]">{message}</p>}
      {error && !dialogOpen && (
        <p className="mb-2 shrink-0 text-sm text-[var(--danger)]" data-testid="add-parking-error">
          {error}
        </p>
      )}

      {rows === null ? (
        <p className="text-sm text-black/50">Loading parking…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state flex-1" data-testid="society-parkings-empty">
          No parking yet. Use Add parking or upload a CSV.
        </div>
      ) : (
        <>
          <div className="table-wrap table-scroll mb-3">
            <table className="data-table" data-testid="society-parkings-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Type</th>
                  <th>Wing</th>
                  <th>Parking</th>
                  <th>Assigned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((row, index) => (
                  <tr
                    key={row.id}
                    className={editingId === row.id ? "bg-[var(--mist)]" : undefined}
                  >
                    <td className="tabular-nums text-black/50" data-testid="parking-serial">
                      {paged.from + index}
                    </td>
                    <td>{kindLabel(row.kind)}</td>
                    <td>{row.wing ?? "—"}</td>
                    <td>{row.slotNumber}</td>
                    <td>{row.flatNumber ?? "—"}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`parking-edit-${row.id}`}
                          disabled={busy}
                          onClick={() => startEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`parking-delete-${row.id}`}
                          disabled={busy}
                          onClick={() => askDelete(row)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-sm text-black/60"
            data-testid="parkings-pagination"
          >
            <p>
              {paged.from}–{paged.to} of {paged.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="parkings-page-prev"
                disabled={paged.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span data-testid="parkings-page-label">
                Page {paged.page} of {paged.pageCount}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="parkings-page-next"
                disabled={paged.page >= paged.pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {dialogOpen && (
        <div
          className="sh-dialog-backdrop"
          data-testid="add-parking-dialog-backdrop"
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-parking-dialog-title"
            className="sh-dialog"
            data-testid="add-parking-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 id="add-parking-dialog-title" className="font-semibold">
                {editingId ? "Edit parking" : "Add parking"}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="add-parking-dialog-close"
                disabled={busy}
                onClick={closeDialog}
              >
                Close
              </button>
            </div>

            <form
              className="grid gap-4 sm:grid-cols-2"
              data-testid="add-parking-form"
              onSubmit={onSubmit}
            >
              <div>
                <label className="label" htmlFor="parking-kind">
                  Parking type
                </label>
                <select
                  id="parking-kind"
                  data-testid="add-parking-kind"
                  className="input"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ParkingKind)}
                >
                  <option value="puzzle">Puzzle (wing + number)</option>
                  <option value="open">Open parking</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="parking-number">
                  Parking number
                </label>
                <input
                  id="parking-number"
                  data-testid="add-parking-number"
                  className="input"
                  value={slotNumber}
                  onChange={(e) => setSlotNumber(e.target.value)}
                  placeholder={kind === "puzzle" ? "101" : "12"}
                  required
                />
                {kind === "puzzle" && (
                  <p className="mt-1 text-xs text-black/50">
                    Slot only — do not include the wing (not A-101).
                  </p>
                )}
              </div>
              {kind === "puzzle" && (
                <div>
                  <label className="label" htmlFor="parking-wing">
                    Wing
                  </label>
                  <input
                    id="parking-wing"
                    data-testid="add-parking-wing"
                    className="input"
                    value={wing}
                    onChange={(e) => setWing(e.target.value)}
                    placeholder="A, B, C, or D"
                    required
                  />
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                <button
                  className="btn btn-primary"
                  data-testid="add-parking-submit"
                  disabled={busy}
                  type="submit"
                >
                  {editingId ? "Save parking" : "Add parking"}
                </button>
                <button
                  className="btn btn-ghost"
                  data-testid="add-parking-cancel"
                  disabled={busy}
                  type="button"
                  onClick={closeDialog}
                >
                  Cancel
                </button>
              </div>
            </form>

            {!editingId && (
              <div className="mt-5 border-t border-[var(--sand)] pt-4">
                <p className="text-sm font-medium">Bulk upload</p>
                <p className="mt-1 text-xs text-black/50">
                  CSV columns: kind, wing, slotNumber. Use kind=puzzle or open.
                  Parking number is the slot only (101), not A-101. Leave wing
                  blank for open parking.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a
                    className="text-xs text-[var(--leaf)] underline"
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(PARKING_CSV_TEMPLATE)}`}
                    download="society-parkings-template.csv"
                  >
                    Download template
                  </a>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="text-xs"
                    data-testid="add-parking-csv"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void onCsv(file);
                    }}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-[var(--danger)]" data-testid="add-parking-error">
                {error}
              </p>
            )}
            {message && dialogOpen && (
              <p className="mt-3 text-sm text-[var(--leaf)]">{message}</p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete parking"
        message={
          pendingDelete
            ? `Delete parking ${
                pendingDelete.kind === "puzzle"
                  ? `${pendingDelete.wing ?? "—"} · ${pendingDelete.slotNumber}`
                  : pendingDelete.slotNumber
              }? This removes it from Client App onboard.`
            : ""
        }
        confirmLabel="Delete"
        busy={busy}
        error={deleteError}
        onCancel={closeDelete}
        onConfirm={() => void confirmDelete()}
        testId="delete-parking-dialog"
      />
    </section>
  );
}
