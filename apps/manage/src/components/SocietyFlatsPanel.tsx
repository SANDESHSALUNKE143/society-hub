import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { FlatDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { FLAT_CSV_TEMPLATE, parseFlatCsv, type ParsedFlatRow } from "../lib/flat-csv";
import { paginateItems } from "../lib/flat-list";
import { ConfirmDialog } from "./ConfirmDialog";
import { CsvImportPreviewDialog } from "./CsvImportPreviewDialog";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

type BuildingOption = { id: string; name: string };

const NEW_TOWER_VALUE = "__new__";

const FLAT_PREVIEW_COLUMNS = [
  {
    key: "wing",
    header: "Wing",
    render: (row: Record<string, unknown>) => String(row.wing ?? ""),
  },
  {
    key: "floor",
    header: "Floor",
    render: (row: Record<string, unknown>) => String(row.floor ?? ""),
  },
  {
    key: "flatNumber",
    header: "Flat",
    render: (row: Record<string, unknown>) => String(row.flatNumber ?? ""),
  },
];

export function SocietyFlatsPanel({ societyId }: { societyId: string }) {
  const { client } = useAuth();
  const [rows, setRows] = useState<FlatDto[] | null>(null);
  const [buildings, setBuildings] = useState<BuildingOption[]>([]);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buildingChoice, setBuildingChoice] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [wing, setWing] = useState("");
  const [floor, setFloor] = useState("");
  const [flatNumber, setFlatNumber] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<FlatDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<ParsedFlatRow[]>([]);
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const paged = useMemo(() => paginateItems(rows ?? [], page), [rows, page]);

  useEffect(() => {
    setPage((current) => Math.min(current, paged.pageCount));
  }, [paged.pageCount]);

  const loadBuildings = useCallback(() => {
    return client
      .listManageSocietyBuildings(societyId)
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, [client, societyId]);

  const load = useCallback(() => {
    return client
      .listManageSocietyFlats(societyId)
      .then((list) => setRows(list))
      .catch((err) => {
        setRows([]);
        setError(errMessage(err, "Failed to load flats"));
      });
  }, [client, societyId]);

  useEffect(() => {
    void load();
    void loadBuildings();
  }, [load, loadBuildings]);

  function clearForm() {
    setEditingId(null);
    setBuildingChoice(buildings[0]?.id ?? "");
    setNewBuildingName("");
    setWing("");
    setFloor("");
    setFlatNumber("");
  }

  function closeDialog() {
    if (busy) return;
    setDialogOpen(false);
    clearForm();
  }

  function openAdd() {
    clearForm();
    setBuildingChoice(buildings[0]?.id ?? NEW_TOWER_VALUE);
    setError(null);
    setMessage(null);
    setDialogOpen(true);
  }

  function startEdit(row: FlatDto) {
    setEditingId(row.id);
    setBuildingChoice(row.buildingId ?? buildings[0]?.id ?? NEW_TOWER_VALUE);
    setNewBuildingName("");
    setWing(row.wingName ?? "");
    setFloor(row.floor == null ? "" : String(row.floor));
    setFlatNumber(row.number);
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

  function resolveBuildingPayload():
    | { buildingId: string }
    | { buildingName: string }
    | null {
    if (buildingChoice === NEW_TOWER_VALUE) {
      const name = newBuildingName.trim();
      if (!name) return null;
      return { buildingName: name };
    }
    if (!buildingChoice) return null;
    return { buildingId: buildingChoice };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const tower = resolveBuildingPayload();
    if (!tower) {
      setError("Select a tower or enter a new tower name.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const body = {
      ...tower,
      wing: wing.trim(),
      floor: Number(floor),
      flatNumber: flatNumber.trim(),
    };
    try {
      if (editingId) {
        await client.updateManageSocietyFlat(societyId, editingId, body);
        setMessage("Flat updated.");
      } else {
        await client.addManageSocietyFlat(societyId, body);
        setMessage("Flat added. It now appears in Client App onboard.");
      }
      clearForm();
      setDialogOpen(false);
      await Promise.all([load(), loadBuildings()]);
    } catch (err) {
      setError(errMessage(err, editingId ? "Failed to update flat" : "Failed to add flat"));
    } finally {
      setBusy(false);
    }
  }

  function askDelete(row: FlatDto) {
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
      await client.deleteManageSocietyFlat(societyId, pendingDelete.id);
      if (editingId === pendingDelete.id) {
        clearForm();
        setDialogOpen(false);
      }
      setPendingDelete(null);
      setMessage("Flat deleted.");
      await load();
    } catch (err) {
      setDeleteError(errMessage(err, "Failed to delete flat"));
    } finally {
      setBusy(false);
    }
  }

  async function onCsvSelected(file: File | null) {
    if (!file) return;
    const tower = resolveBuildingPayload();
    if (!tower) {
      setError("Select a tower before uploading the CSV.");
      return;
    }
    setError(null);
    setMessage(null);
    setPreviewError(null);
    try {
      const parsed = parseFlatCsv(await file.text());
      setParseErrors(parsed.errors);
      setPreviewRows(parsed.rows);
      setPreviewFileName(file.name);
      setPreviewOpen(true);
      if (parsed.rows.length === 0 && parsed.errors.length > 0) {
        setPreviewError("No valid rows to import. Fix the CSV and try again.");
      }
    } catch {
      setError("Could not read that CSV file");
    }
  }

  function closePreview() {
    if (busy) return;
    setPreviewOpen(false);
    setPreviewRows([]);
    setPreviewFileName(null);
    setPreviewError(null);
  }

  async function confirmCsvImport() {
    if (previewRows.length === 0) return;
    const tower = resolveBuildingPayload();
    if (!tower) {
      setPreviewError("Select a tower before importing.");
      return;
    }
    setBusy(true);
    setPreviewError(null);
    setError(null);
    setMessage(null);
    try {
      const result = await client.importManageSocietyFlats(societyId, {
        ...tower,
        rows: previewRows,
      });
      const extra = parseErrors.length
        ? ` CSV parse skipped ${parseErrors.length} row(s).`
        : "";
      setMessage(
        `Created ${result.created} · Updated ${result.updated} · Unchanged ${result.skipped} · Errors ${result.errors.length}.${extra}`,
      );
      if (result.errors[0]) {
        setPreviewError(`Row ${result.errors[0].row}: ${result.errors[0].message}`);
      } else {
        setPreviewOpen(false);
        setPreviewRows([]);
        setPreviewFileName(null);
        setDialogOpen(false);
        clearForm();
      }
      await Promise.all([load(), loadBuildings()]);
    } catch (err) {
      setPreviewError(errMessage(err, "Failed to import flats"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="society-flats">
      <div className="mb-3 flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Flats</h2>
          <p className="mt-1 text-sm text-black/55">
            Add flat numbers under a tower from Structure. Society staff pick these
            flats when onboarding. Flat numbers must be unique in this society.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="add-flat-open"
          disabled={busy}
          onClick={openAdd}
        >
          Add flat
        </button>
      </div>

      {message && <p className="mb-2 shrink-0 text-sm text-[var(--leaf)]">{message}</p>}
      {error && !dialogOpen && (
        <p className="mb-2 shrink-0 text-sm text-[var(--danger)]" data-testid="add-flat-error">
          {error}
        </p>
      )}

      {rows === null ? (
        <p className="text-sm text-black/50">Loading flats…</p>
      ) : rows.length === 0 ? (
        <div className="empty-state flex-1" data-testid="society-flats-empty">
          No flats yet. Use Add flat to create one or upload a CSV under a tower.
        </div>
      ) : (
        <>
          <div className="table-wrap table-scroll mb-3">
            <table className="data-table" data-testid="society-flats-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Tower</th>
                  <th>Wing</th>
                  <th>Floor</th>
                  <th>Flat</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.items.map((row, index) => (
                  <tr
                    key={row.id}
                    className={editingId === row.id ? "bg-[var(--mist)]" : undefined}
                  >
                    <td className="tabular-nums text-black/50" data-testid="flat-serial">
                      {paged.from + index}
                    </td>
                    <td>{row.buildingName ?? "—"}</td>
                    <td>{row.wingName ?? "—"}</td>
                    <td>{row.floor ?? "—"}</td>
                    <td>{row.number}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`flat-edit-${row.id}`}
                          disabled={busy}
                          onClick={() => startEdit(row)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`flat-delete-${row.id}`}
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
            data-testid="flats-pagination"
          >
            <p>
              {paged.from}–{paged.to} of {paged.total}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="flats-page-prev"
                disabled={paged.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span data-testid="flats-page-label">
                Page {paged.page} of {paged.pageCount}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="flats-page-next"
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
          data-testid="add-flat-dialog-backdrop"
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-flat-dialog-title"
            className="sh-dialog"
            data-testid="add-flat-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 id="add-flat-dialog-title" className="font-semibold">
                {editingId ? "Edit flat" : "Add flat"}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="add-flat-dialog-close"
                disabled={busy}
                onClick={closeDialog}
              >
                Close
              </button>
            </div>

            <form
              className="grid gap-4 sm:grid-cols-2"
              data-testid="add-flat-form"
              onSubmit={onSubmit}
            >
              <div className="sm:col-span-2">
                <label className="label" htmlFor="flat-tower">
                  Tower
                </label>
                <select
                  id="flat-tower"
                  data-testid="add-flat-tower"
                  className="input"
                  value={buildingChoice}
                  onChange={(e) => setBuildingChoice(e.target.value)}
                  required
                >
                  {buildings.length === 0 && (
                    <option value={NEW_TOWER_VALUE}>Create new tower…</option>
                  )}
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                  {buildings.length > 0 && (
                    <option value={NEW_TOWER_VALUE}>Create new tower…</option>
                  )}
                </select>
              </div>
              {buildingChoice === NEW_TOWER_VALUE && (
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="flat-tower-name">
                    New tower name
                  </label>
                  <input
                    id="flat-tower-name"
                    data-testid="add-flat-tower-name"
                    className="input"
                    value={newBuildingName}
                    onChange={(e) => setNewBuildingName(e.target.value)}
                    placeholder="Tower A"
                    autoFocus
                    required
                  />
                </div>
              )}
              <div>
                <label className="label" htmlFor="flat-wing">
                  Wing
                </label>
                <input
                  id="flat-wing"
                  data-testid="add-flat-wing"
                  className="input"
                  value={wing}
                  onChange={(e) => setWing(e.target.value)}
                  placeholder="A"
                  autoFocus={buildingChoice !== NEW_TOWER_VALUE}
                  required
                />
              </div>
              <div>
                <label className="label" htmlFor="flat-floor">
                  Floor
                </label>
                <input
                  id="flat-floor"
                  data-testid="add-flat-floor"
                  className="input"
                  type="number"
                  min={0}
                  max={200}
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="flat-number">
                  Flat number
                </label>
                <input
                  id="flat-number"
                  data-testid="add-flat-number"
                  className="input"
                  value={flatNumber}
                  onChange={(e) => setFlatNumber(e.target.value)}
                  placeholder="101"
                  required
                />
              </div>
              <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
                <button
                  className="btn btn-primary"
                  data-testid="add-flat-submit"
                  disabled={busy}
                  type="submit"
                >
                  {editingId ? "Save flat" : "Add flat"}
                </button>
                <button
                  className="btn btn-ghost"
                  data-testid="add-flat-cancel"
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
                  Choose the tower above first. CSV columns: wing, floor,
                  flatNumber (no tower column). All rows land under that tower.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <a
                    className="text-xs text-[var(--leaf)] underline"
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(FLAT_CSV_TEMPLATE)}`}
                    download="society-flats-template.csv"
                  >
                    Download template
                  </a>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="text-xs"
                    data-testid="add-flat-csv"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void onCsvSelected(file);
                    }}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-sm text-[var(--danger)]" data-testid="add-flat-error">
                {error}
              </p>
            )}
            {message && dialogOpen && (
              <p className="mt-3 text-sm text-[var(--leaf)]">{message}</p>
            )}
          </div>
        </div>
      )}

      <CsvImportPreviewDialog
        open={previewOpen}
        title="Review flats CSV"
        fileName={previewFileName}
        columns={FLAT_PREVIEW_COLUMNS}
        rows={previewRows as unknown as Array<Record<string, unknown>>}
        parseErrors={parseErrors}
        busy={busy}
        error={previewError}
        confirmLabel={`Import ${previewRows.length} flat${previewRows.length === 1 ? "" : "s"}`}
        onCancel={closePreview}
        onConfirm={() => void confirmCsvImport()}
        testId="flat-csv-preview"
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete flat"
        message={
          pendingDelete
            ? `Delete flat ${pendingDelete.buildingName ? `${pendingDelete.buildingName} · ` : ""}${pendingDelete.wingName ?? "—"}-${pendingDelete.number}? This removes it from Client App onboard.`
            : ""
        }
        confirmLabel="Delete"
        busy={busy}
        error={deleteError}
        onCancel={closeDelete}
        onConfirm={() => void confirmDelete()}
        testId="delete-flat-dialog"
      />
    </section>
  );
}
