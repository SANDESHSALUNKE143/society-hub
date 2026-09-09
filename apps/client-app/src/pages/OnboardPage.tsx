import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  INCLUDED_FOUR_WHEELER_PARKING,
  INCLUDED_TWO_WHEELER_PARKING,
  vehicleParkingQuotaMessage,
  type FlatDto,
  type ResidentImportResultDto,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  ShField,
  ShFormGrid,
  ShPage,
  ShPageHeader,
  ShSection,
  ShSplit,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";
import { VehicleFields } from "../components/VehicleFields";
import { mapResidentCsvRows, parseCsv } from "../lib/resident-csv";
import {
  householdVehiclesForQuota,
  remainingIncluded,
  toVehiclePayload,
  type VehicleDraft,
} from "../lib/vehicle-draft";

const CSV_TEMPLATE = `name,phone,email,flatNumber,wingName,floor,parkingSlot,isOwner,emergencyContact,vehicleNumber,twoWheelers,fourWheelers,pngGasConnection,adults,children,seniorCitizens
Count Only,8888888888,,101,A,1,P-101,true,9999999999,,2,1,true,2,1,1
With Plates,8888888889,resident@example.com,102,A,1,P-102,true,9999999998,MH12AB1234,MH12TW0001;MH12TW0002,MH12AB1234,true,2,0,0
`;

export function OnboardPage() {
  const { user, client } = useAuth();
  const [flats, setFlats] = useState<FlatDto[]>([]);
  const [societyName, setSocietyName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [flatId, setFlatId] = useState("");
  const [floor, setFloor] = useState("");
  const [parkingSlot, setParkingSlot] = useState("");
  const [isOwner, setIsOwner] = useState(true);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [pngGasConnection, setPngGasConnection] = useState(false);
  const [adultCount, setAdultCount] = useState("0");
  const [childCount, setChildCount] = useState("0");
  const [seniorCitizenCount, setSeniorCitizenCount] = useState("0");
  const [twoWheelers, setTwoWheelers] = useState<VehicleDraft[]>([]);
  const [fourWheelers, setFourWheelers] = useState<VehicleDraft[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ResidentImportResultDto | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [sendInvites, setSendInvites] = useState(true);
  const [createMissingFlats, setCreateMissingFlats] = useState(false);
  const [forceInvite, setForceInvite] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
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

  useEffect(() => {
    const selected = flats.find((f) => f.id === flatId);
    if (!selected) return;
    setFloor(selected.floor != null ? String(selected.floor) : "");
    setParkingSlot(selected.parkingSlot ?? "");
    setPngGasConnection(Boolean(selected.pngGasConnection));
    setAdultCount(String(selected.adultCount ?? 0));
    setChildCount(String(selected.childCount ?? 0));
    setSeniorCitizenCount(String(selected.seniorCitizenCount ?? 0));
  }, [flatId, flats]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const selected = flats.find((f) => f.id === flatId);
    const remainingTw = remainingIncluded(
      selected?.twoWheelerCount,
      INCLUDED_TWO_WHEELER_PARKING,
    );
    const remainingFw = remainingIncluded(
      selected?.fourWheelerCount,
      INCLUDED_FOUR_WHEELER_PARKING,
    );
    const vehicles = [
      ...toVehiclePayload("two_wheeler", twoWheelers, remainingTw),
      ...toVehiclePayload("four_wheeler", fourWheelers, remainingFw),
    ];
    const quotaError = vehicleParkingQuotaMessage([
      ...householdVehiclesForQuota(selected ?? {}),
      ...vehicles,
    ]);
    if (quotaError) {
      setError(
        `${quotaError}. Included parking is per flat, across all family members.`,
      );
      return;
    }
    try {
      const res = await client.onboardResident({
        name,
        phone,
        flatId,
        email: email.trim() || null,
        floor: floor === "" ? null : Number(floor),
        parkingSlot: parkingSlot.trim() || null,
        isOwner,
        emergencyContact: emergencyContact.trim() || null,
        vehicles,
        pngGasConnection,
        adultCount: Number(adultCount) || 0,
        childCount: Number(childCount) || 0,
        seniorCitizenCount: Number(seniorCitizenCount) || 0,
      });
      setMessage(`Onboarded ${res.user.name} (${res.user.phone})`);
      setName("");
      setPhone("");
      setEmail("");
      setEmergencyContact("");
      setTwoWheelers([]);
      setFourWheelers([]);
      try {
        const rows = await client.listFlats();
        setFlats(rows);
      } catch {
        /* onboard already succeeded */
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  async function onCsvSelected(file: File | null) {
    setImportResult(null);
    setImportErrors([]);
    setError(null);
    if (!file) return;
    setBusyImport(true);
    try {
      const text = await file.text();
      const raw = parseCsv(text);
      const mapped = mapResidentCsvRows(raw);
      if (mapped.errors.length) {
        setImportErrors(mapped.errors);
      }
      if (mapped.rows.length === 0) {
        setError("No valid rows to import. Fix CSV errors and try again.");
        return;
      }
      const result = await client.importResidents({
        rows: mapped.rows,
        sendInvites,
        forceInvite,
        updateFlats: true,
        createMissingFlats,
      });
      setImportResult(result);
      setImportErrors([...mapped.errors, ...result.errors]);
      setMessage(
        `Import finished: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.invited} invited, ${result.skipped} skipped.`,
      );
      try {
        const rows = await client.listFlats();
        setFlats(rows);
      } catch {
        /* import already succeeded */
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "CSV import failed");
    } finally {
      setBusyImport(false);
    }
  }

  return (
    <ShPage wide>
      <ShPageHeader
        title="Onboard residents"
        description={
          <>
            Add family members one at a time, or bulk-import via CSV. Several people
            can share the same flat — each needs their own mobile number. Flats must
            exist under{" "}
            <Link to="/structure" className="text-[var(--leaf)]">
              Structure
            </Link>{" "}
            first. Each flat includes {INCLUDED_TWO_WHEELER_PARKING} two-wheeler and{" "}
            {INCLUDED_FOUR_WHEELER_PARKING} four-wheeler parking across the household;
            extra vehicles need a purchased slot.
          </>
        }
      />

      <ShSplit>
        <form
          className="card sh-section space-y-3"
          onSubmit={onSubmit}
          data-testid="onboard-form"
        >
          <h2 className="text-sm font-semibold">Add a family member</h2>
          <p className="text-xs text-black/50">
            Repeat this form for each person in the flat. Same wing/flat is allowed.
          </p>
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
            <ShField label="Email (optional)" htmlFor="onboard-email">
              <input
                id="onboard-email"
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </ShField>
            <ShField label="Wing / flat" htmlFor="flat">
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
            <ShField label="Floor" htmlFor="onboard-floor">
              <input
                id="onboard-floor"
                data-testid="onboard-floor"
                className="input"
                type="number"
                min={0}
                max={200}
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
            </ShField>
            <ShField label="Parking slot" htmlFor="onboard-parking">
              <input
                id="onboard-parking"
                data-testid="onboard-parking"
                className="input"
                value={parkingSlot}
                onChange={(e) => setParkingSlot(e.target.value)}
                placeholder="Primary slot label"
              />
            </ShField>
            <ShField label="Emergency contact" htmlFor="onboard-emergency">
              <input
                id="onboard-emergency"
                data-testid="onboard-emergency"
                className="input"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
              />
            </ShField>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="onboard-is-owner"
                checked={isOwner}
                onChange={(e) => setIsOwner(e.target.checked)}
              />
              Owner of this flat (uncheck for other family members or tenants)
            </label>
            <fieldset className="sh-span-2">
              <legend className="label mb-1">PNG gas connection</legend>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="png-gas"
                    data-testid="onboard-png-yes"
                    checked={pngGasConnection}
                    onChange={() => setPngGasConnection(true)}
                  />
                  Taken
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="png-gas"
                    data-testid="onboard-png-no"
                    checked={!pngGasConnection}
                    onChange={() => setPngGasConnection(false)}
                  />
                  Not taken
                </label>
              </div>
            </fieldset>
            <fieldset className="sh-span-2">
              <legend className="label mb-1">Family members in this flat</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                <ShField label="Adults" htmlFor="onboard-adults">
                  <input
                    id="onboard-adults"
                    data-testid="onboard-adults"
                    className="input"
                    type="number"
                    min={0}
                    max={50}
                    value={adultCount}
                    onChange={(e) => setAdultCount(e.target.value)}
                  />
                </ShField>
                <ShField label="Children" htmlFor="onboard-children">
                  <input
                    id="onboard-children"
                    data-testid="onboard-children"
                    className="input"
                    type="number"
                    min={0}
                    max={50}
                    value={childCount}
                    onChange={(e) => setChildCount(e.target.value)}
                  />
                </ShField>
                <ShField label="Senior citizens" htmlFor="onboard-seniors">
                  <input
                    id="onboard-seniors"
                    data-testid="onboard-seniors"
                    className="input"
                    type="number"
                    min={0}
                    max={50}
                    value={seniorCitizenCount}
                    onChange={(e) => setSeniorCitizenCount(e.target.value)}
                  />
                </ShField>
              </div>
            </fieldset>
            <VehicleFields
              kind="two_wheeler"
              label="Two-wheelers"
              included={remainingIncluded(
                flats.find((f) => f.id === flatId)?.twoWheelerCount,
                INCLUDED_TWO_WHEELER_PARKING,
              )}
              rows={twoWheelers}
              onChange={setTwoWheelers}
            />
            <VehicleFields
              kind="four_wheeler"
              label="Four-wheelers"
              included={remainingIncluded(
                flats.find((f) => f.id === flatId)?.fourWheelerCount,
                INCLUDED_FOUR_WHEELER_PARKING,
              )}
              rows={fourWheelers}
              onChange={setFourWheelers}
            />
          </ShFormGrid>
          <button className="btn btn-primary" data-testid="onboard-submit" type="submit">
            Onboard
          </button>
        </form>

        <ShSection
          title="Bulk import (CSV)"
          description="Re-upload updates existing residents matched by phone."
          testId="onboard-csv"
        >
          <p className="mb-2 text-[11px] leading-snug text-black/50">
            Headers: name, phone, email, flatNumber, wingName, floor, parkingSlot, isOwner,
            emergencyContact, vehicleNumber, twoWheelers, fourWheelers, pngGasConnection,
            adults, children, seniorCitizens.
            twoWheelers / fourWheelers can be a count (example <code>2</code> /{" "}
            <code>1</code>) with no registration numbers, or plates separated by{" "}
            <code>;</code>. Extra vehicles: append <code>|purchased</code> (example{" "}
            <code>MH12TW3|purchased</code>). Count-only extras beyond included parking
            are stored as purchased. Family counts are for the whole flat.
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
          <input
            type="file"
            accept=".csv,text/csv"
            className="text-xs"
            data-testid="onboard-csv-input"
            disabled={busyImport}
            onChange={(e) => void onCsvSelected(e.target.files?.[0] ?? null)}
          />
          {importResult && (
            <p className="mt-2 text-xs text-[var(--leaf)]" data-testid="onboard-csv-result">
              Created {importResult.created} · Updated {importResult.updated} · Unchanged{" "}
              {importResult.unchanged} · Invited {importResult.invited} · Skipped{" "}
              {importResult.skipped}
            </p>
          )}
          {importErrors.length > 0 && (
            <ul className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-[var(--mist)]/40 p-2 text-[11px] text-[var(--danger)]">
              {importErrors.slice(0, 30).map((err) => (
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
