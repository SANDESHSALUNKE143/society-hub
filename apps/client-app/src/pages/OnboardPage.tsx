import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type {
  FlatDto,
  ResidentImportPreviewDto,
  ResidentImportResultDto,
  ResidentType,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  RESIDENT_TYPE_LABELS,
  ShField,
  ShFormGrid,
  ShPage,
  ShPageHeader,
  ShSection,
  ShSplit,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";
import { mapResidentCsvRows, parseCsv, type ResidentCsvRow } from "../lib/resident-csv";

const CSV_TEMPLATE = `name,phone,email,flatNumber,wingName,floor,parkingSlot,isOwner,emergencyContact,vehicleNumber
Demo Resident,8888888888,resident@example.com,101,A,1,P-101,true,9999999999,MH12AB1234
`;

type ImportStage = "idle" | "previewing" | "preview" | "importing" | "done";

export function OnboardPage() {
  const { user, client } = useAuth();
  const [flats, setFlats] = useState<FlatDto[]>([]);
  const [societyName, setSocietyName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [flatId, setFlatId] = useState("");
  const [residentType, setResidentType] = useState<ResidentType>("owner");
  const [isPrimary, setIsPrimary] = useState(true);
  const [moveInDate, setMoveInDate] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [stage, setStage] = useState<ImportStage>("idle");
  const [parseErrors, setParseErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [pendingRows, setPendingRows] = useState<ResidentCsvRow[]>([]);
  const [preview, setPreview] = useState<ResidentImportPreviewDto | null>(null);
  const [importResult, setImportResult] = useState<ResidentImportResultDto | null>(null);
  const [sendInvites, setSendInvites] = useState(true);
  const [createMissingFlats, setCreateMissingFlats] = useState(false);
  const [forceInvite, setForceInvite] = useState(false);
  const [allowPartial, setAllowPartial] = useState(false);
  const allowed = canUseAdminMode(user?.role);

  useEffect(() => {
    if (!allowed) return;
    client.listFlats().then((rows) => {
      setFlats(rows);
      if (rows[0]) setFlatId(rows[0].id);
    });
    client
      .listMemberships()
      .then((rows) => {
        const mine = rows.find((r) => r.tenantId === user?.tenantId);
        if (mine) setSocietyName(mine.societyName);
      })
      .catch(() => undefined);
  }, [client, user, allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const res = await client.onboardResident({
        name,
        phone,
        flatId,
        email,
        residentType,
        isPrimary,
        moveInDate: moveInDate || null,
      });
      setMessage(`Onboarded ${res.user.name} (${res.user.phone})`);
      setName("");
      setPhone("");
      setEmail("");
      setMoveInDate("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  /** Step 1 — parse locally, then ask the server what the import would do. */
  async function onCsvSelected(file: File | null) {
    setImportResult(null);
    setPreview(null);
    setParseErrors([]);
    setError(null);
    if (!file) return;
    setStage("previewing");
    try {
      const mapped = mapResidentCsvRows(parseCsv(await file.text()));
      setParseErrors(mapped.errors);
      if (mapped.rows.length === 0) {
        setError("No readable rows in this file. Fix the errors below and try again.");
        setStage("idle");
        return;
      }
      setPendingRows(mapped.rows);
      setPreview(
        await client.previewResidentImport({ rows: mapped.rows, createMissingFlats }),
      );
      setStage("preview");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not read the CSV");
      setStage("idle");
    }
  }

  /** Step 2 — apply the import the admin just reviewed. */
  async function confirmImport() {
    setStage("importing");
    setError(null);
    try {
      const result = await client.importResidents({
        rows: pendingRows,
        sendInvites,
        forceInvite,
        updateFlats: true,
        createMissingFlats,
        allowPartial,
      });
      setImportResult(result);
      setStage("done");
      setMessage(
        `Import finished — Total ${result.total} · Imported ${result.created + result.updated} · Failed ${result.errors.length} · Skipped ${result.skipped}`,
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Import failed");
      setStage("preview");
    }
  }

  function resetImport() {
    setStage("idle");
    setPreview(null);
    setPendingRows([]);
    setImportResult(null);
    setParseErrors([]);
    setMessage(null);
  }

  const blockedRows = preview?.rows.filter((r) => r.errors.length > 0) ?? [];

  return (
    <ShPage wide>
      <ShPageHeader
        title="Add residents"
        description={
          <>
            Add one resident or bulk-import via CSV. Flats must exist under{" "}
            <Link to="/structure" className="text-[var(--leaf)]">
              Structure
            </Link>{" "}
            first.
          </>
        }
        actions={
          <Link to="/residents" className="btn btn-ghost btn-sm">
            View residents
          </Link>
        }
      />

      <ShSplit>
        <form
          className="card sh-section space-y-3"
          onSubmit={onSubmit}
          data-testid="onboard-form"
        >
          <h2 className="text-sm font-semibold">Single resident</h2>
          <ShFormGrid>
            <ShField label="Society" htmlFor="onboard-society-name" className="sh-span-2">
              <input
                id="onboard-society-name"
                data-testid="onboard-society-name"
                className="input bg-[var(--mist)]/50"
                value={societyName ?? "—"}
                readOnly
                disabled
              />
            </ShField>
            <ShField label="Resident name" htmlFor="name">
              <input
                id="name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </ShField>
            <ShField label="Phone" htmlFor="phone">
              <input
                id="phone"
                className="input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </ShField>
            <ShField label="Email" htmlFor="onboard-email">
              <input
                id="onboard-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </ShField>
            <ShField label="Flat" htmlFor="flat">
              <select
                id="flat"
                className="input"
                value={flatId}
                onChange={(e) => setFlatId(e.target.value)}
                required
              >
                {flats.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.wingName ? `${f.wingName}-` : ""}
                    {f.number}
                    {f.floor != null ? ` · Fl ${f.floor}` : ""}
                    {f.parkingSlot ? ` · ${f.parkingSlot}` : ""}
                  </option>
                ))}
              </select>
            </ShField>
            <ShField label="Resident type" htmlFor="onboard-resident-type">
              <select
                id="onboard-resident-type"
                className="input"
                value={residentType}
                data-testid="onboard-resident-type"
                onChange={(e) => setResidentType(e.target.value as ResidentType)}
              >
                {Object.entries(RESIDENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </ShField>
            <ShField label="Move-in date" htmlFor="onboard-move-in">
              <input
                id="onboard-move-in"
                className="input"
                type="date"
                value={moveInDate}
                data-testid="onboard-move-in"
                onChange={(e) => setMoveInDate(e.target.value)}
              />
            </ShField>
          </ShFormGrid>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={isPrimary}
              data-testid="onboard-is-primary"
              onChange={(e) => setIsPrimary(e.target.checked)}
            />
            Primary {residentType === "tenant" ? "tenant" : "owner"} for this flat
          </label>
          <button
            className="btn btn-primary"
            data-testid="onboard-submit"
            type="submit"
            disabled={busy}
          >
            {busy ? "Onboarding…" : "Onboard"}
          </button>
        </form>

        <ShSection
          title="Bulk import (CSV)"
          description="Upload → validate → preview → confirm. Nothing is written until you confirm."
          testId="onboard-csv"
        >
          <p className="mb-2 text-[11px] leading-snug text-black/50">
            Headers: name, phone, email, flatNumber, wingName, floor, parkingSlot, isOwner,
            emergencyContact, vehicleNumber
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <a
              className="btn btn-ghost btn-sm"
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(CSV_TEMPLATE)}`}
              download="residents-template.csv"
            >
              Download template
            </a>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={sendInvites}
                onChange={(e) => setSendInvites(e.target.checked)}
              />
              Invite new
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={forceInvite}
                onChange={(e) => setForceInvite(e.target.checked)}
              />
              Re-invite
            </label>
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={createMissingFlats}
                onChange={(e) => setCreateMissingFlats(e.target.checked)}
              />
              Create missing flats
            </label>
          </div>

          {stage === "idle" && (
            <input
              type="file"
              accept=".csv,text/csv"
              className="text-xs"
              data-testid="onboard-csv-input"
              onChange={(e) => void onCsvSelected(e.target.files?.[0] ?? null)}
            />
          )}
          {stage === "previewing" && (
            <p className="text-xs text-black/55" data-testid="onboard-csv-validating">
              Validating…
            </p>
          )}

          {preview && (stage === "preview" || stage === "importing") && (
            <div data-testid="onboard-csv-preview">
              <dl className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-5">
                <div>
                  <dt className="text-black/45">Total</dt>
                  <dd className="font-semibold" data-testid="preview-total">
                    {preview.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-black/45">Will create</dt>
                  <dd className="font-semibold" data-testid="preview-create">
                    {preview.willCreate}
                  </dd>
                </div>
                <div>
                  <dt className="text-black/45">Will update</dt>
                  <dd className="font-semibold" data-testid="preview-update">
                    {preview.willUpdate}
                  </dd>
                </div>
                <div>
                  <dt className="text-black/45">Unchanged</dt>
                  <dd className="font-semibold">{preview.unchanged}</dd>
                </div>
                <div>
                  <dt className="text-black/45">Invalid</dt>
                  <dd className="font-semibold text-[var(--danger)]" data-testid="preview-invalid">
                    {preview.invalid}
                  </dd>
                </div>
              </dl>

              {blockedRows.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-[var(--danger)]">
                    {blockedRows.length} row(s) cannot be imported
                  </p>
                  <ul
                    className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--mist)]/40 p-2 text-[11px]"
                    data-testid="preview-errors"
                  >
                    {blockedRows.slice(0, 50).map((row) => (
                      <li key={row.row}>
                        <span className="font-semibold">Row {row.row}</span>
                        {row.flatNumber ? ` · Flat: ${row.flatNumber}` : ""}
                        <br />
                        <span className="text-[var(--danger)]">{row.errors.join("; ")}</span>
                      </li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={allowPartial}
                      data-testid="onboard-allow-partial"
                      onChange={(e) => setAllowPartial(e.target.checked)}
                    />
                    Import the valid rows anyway and skip the rest
                  </label>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="onboard-csv-confirm"
                  disabled={
                    stage === "importing" || (blockedRows.length > 0 && !allowPartial)
                  }
                  onClick={confirmImport}
                >
                  {stage === "importing" ? "Importing…" : "Confirm import"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={resetImport}
                  data-testid="onboard-csv-cancel"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {importResult && stage === "done" && (
            <div data-testid="onboard-csv-result">
              <p className="mt-2 text-xs text-[var(--leaf)]">
                Total {importResult.total} · Created {importResult.created} · Updated{" "}
                {importResult.updated} · Unchanged {importResult.unchanged} · Invited{" "}
                {importResult.invited} · Skipped {importResult.skipped}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[var(--mist)]/40 p-2 text-[11px] text-[var(--danger)]">
                  {importResult.errors.slice(0, 50).map((err) => (
                    <li key={`${err.row}-${err.message}`}>
                      Row {err.row}
                      {err.flatNumber ? ` · Flat: ${err.flatNumber}` : ""}: {err.message}
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-2"
                onClick={resetImport}
              >
                Import another file
              </button>
            </div>
          )}

          {parseErrors.length > 0 && (
            <ul
              className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-[var(--mist)]/40 p-2 text-[11px] text-[var(--danger)]"
              data-testid="onboard-csv-parse-errors"
            >
              {parseErrors.slice(0, 30).map((err) => (
                <li key={`${err.row}-${err.message}`}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          )}
        </ShSection>
      </ShSplit>

      {message && <p className="mt-3 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </ShPage>
  );
}
