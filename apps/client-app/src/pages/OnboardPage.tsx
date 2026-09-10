import { FormEvent, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  INCLUDED_FOUR_WHEELER_PARKING,
  INCLUDED_TWO_WHEELER_PARKING,
  vehicleParkingQuotaMessage,
  type FlatDto,
  type ParkingKind,
  type ParkingSlotDto,
  type ResidentImportResultDto,
  type SocietyResidentDto,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  HOUSEHOLD_TABS,
  ShField,
  ShFormGrid,
  ShPage,
  ShPageHeader,
  ShTabs,
  householdSubmitLabel,
  preferredParkingKind,
  WingFlatSelect,
  type HouseholdTabId,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";
import { AllottedParkingFields } from "../components/AllottedParkingFields";
import { FamilyMembersEditor } from "../components/FamilyMembersEditor";
import { HouseholdAgeCounts } from "../components/HouseholdAgeCounts";
import { HouseholdOwnerFields } from "../components/HouseholdOwnerFields";
import { PngGasFields } from "../components/PngGasFields";
import { VehicleFields } from "../components/VehicleFields";
import { mapResidentCsvRows, parseCsv } from "../lib/resident-csv";
import {
  emptyVehicleRows,
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
  const [parkings, setParkings] = useState<ParkingSlotDto[]>([]);
  const [parkingKind, setParkingKind] = useState<ParkingKind>("puzzle");
  const [societyName, setSocietyName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [flatId, setFlatId] = useState("");
  const [floor, setFloor] = useState("");
  const [parkingSlot, setParkingSlot] = useState("");
  const [parkingSlotId, setParkingSlotId] = useState("");
  const [isOwner, setIsOwner] = useState(true);
  const [emergencyContact, setEmergencyContact] = useState("");
  const [pngGasConnection, setPngGasConnection] = useState(false);
  const [adultCount, setAdultCount] = useState("0");
  const [childCount, setChildCount] = useState("0");
  const [seniorCitizenCount, setSeniorCitizenCount] = useState("0");
  const [twoWheelers, setTwoWheelers] = useState<VehicleDraft[]>(() =>
    emptyVehicleRows(INCLUDED_TWO_WHEELER_PARKING),
  );
  const [fourWheelers, setFourWheelers] = useState<VehicleDraft[]>(() =>
    emptyVehicleRows(INCLUDED_FOUR_WHEELER_PARKING),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ResidentImportResultDto | null>(null);
  const [importErrors, setImportErrors] = useState<Array<{ row: number; message: string }>>([]);
  const [sendInvites, setSendInvites] = useState(true);
  const [forceInvite, setForceInvite] = useState(false);
  const [busyImport, setBusyImport] = useState(false);
  const [tab, setTab] = useState<HouseholdTabId>("owner");
  const [residents, setResidents] = useState<SocietyResidentDto[]>([]);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const tabTouchedRef = useRef(false);
  const lastFlatIdRef = useRef("");
  const allowed = canUseAdminMode(user?.role);

  useEffect(() => {
    if (!allowed) return;
    client.listFlats().then((rows) => {
      setFlats(rows);
      if (rows[0]) setFlatId(rows[0].id);
    });
    client.listResidents().then(setResidents).catch(() => setResidents([]));
    client
      .listParkings()
      .then((rows) => setParkings(rows))
      .catch(() => setParkings([]));
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
    const assigned =
      parkings.find((p) => p.flatId === selected.id) ??
      parkings.find((p) => p.slotNumber === selected.parkingSlot);
    const nextSlotId = assigned?.id ?? "";
    setParkingKind(
      preferredParkingKind(parkings, assigned, selected.id, nextSlotId),
    );
    setParkingSlot(assigned?.slotNumber ?? selected.parkingSlot ?? "");
    setParkingSlotId(nextSlotId);
    setPngGasConnection(Boolean(selected.pngGasConnection));
    setAdultCount(String(selected.adultCount ?? 0));
    setChildCount(String(selected.childCount ?? 0));
    setSeniorCitizenCount(String(selected.seniorCitizenCount ?? 0));
  }, [flatId, flats, parkings]);

  useEffect(() => {
    if (!flatId) return;
    if (lastFlatIdRef.current !== flatId) {
      lastFlatIdRef.current = flatId;
      tabTouchedRef.current = false;
    }
    if (tabTouchedRef.current) return;
    const ownerExists = residents.some((r) => r.flatId === flatId && r.isOwner);
    setIsOwner(!ownerExists);
    setTab(ownerExists ? "family" : "owner");
    setName("");
    setPhone("");
    setEmail("");
  }, [flatId, residents]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!flatId) {
      setError("Select a flat first");
      return;
    }
    if (tab === "family" || tab === "parking") {
      const owner = peopleOnFlat.find((r) => r.isOwner);
      const ownerName = owner?.name || name;
      const ownerPhone = owner?.phone || phone;
      if (!ownerName.trim() || !ownerPhone.trim()) {
        setError("Add an owner first");
        setTab("owner");
        return;
      }
      try {
        await client.onboardResident({
          name: ownerName,
          phone: ownerPhone,
          flatId,
          email: owner?.email ?? (email.trim() || null),
          floor: floor === "" ? null : Number(floor),
          parkingSlot: parkingSlot.trim() || null,
          parkingSlotId: parkingSlotId || null,
          isOwner: true,
          editOwner: Boolean(owner),
          adultCount: Number(adultCount) || 0,
          childCount: Number(childCount) || 0,
          seniorCitizenCount: Number(seniorCitizenCount) || 0,
        });
        setMessage(tab === "parking" ? "Saved parking" : "Saved household counts");
        const [rows, lots] = await Promise.all([
          client.listFlats(),
          client.listParkings().catch(() => parkings),
        ]);
        setFlats(rows);
        setParkings(lots);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.body.message : "Failed");
      }
      return;
    }
    if (!name.trim() || !phone.trim()) {
      setError("Enter name and contact number");
      setTab(isOwner ? "owner" : "family");
      return;
    }
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
        parkingSlotId: parkingSlotId || null,
        isOwner,
        editOwner: isOwner && hasOwner,
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
      setTwoWheelers(emptyVehicleRows(INCLUDED_TWO_WHEELER_PARKING));
      setFourWheelers(emptyVehicleRows(INCLUDED_FOUR_WHEELER_PARKING));
      setIsOwner(false);
      setTab("family");
      tabTouchedRef.current = true;
      try {
        const [rows, people, lots] = await Promise.all([
          client.listFlats(),
          client.listResidents(),
          client.listParkings().catch(() => parkings),
        ]);
        setFlats(rows);
        setResidents(people);
        setParkings(lots);
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
        createMissingFlats: false,
      });
      setImportResult(result);
      setImportErrors([...mapped.errors, ...result.errors]);
      setMessage(
        `Import finished: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.invited} invited, ${result.skipped} skipped.`,
      );
      try {
        const [rows, people] = await Promise.all([
          client.listFlats(),
          client.listResidents(),
        ]);
        setFlats(rows);
        setResidents(people);
      } catch {
        /* import already succeeded */
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "CSV import failed");
    } finally {
      setBusyImport(false);
    }
  }

  const peopleOnFlat = residents.filter((r) => r.flatId === flatId);
  const ownerOnFlat = peopleOnFlat.find((r) => r.isOwner);
  const hasOwner = Boolean(ownerOnFlat);
  const selectedFlat = flats.find((f) => f.id === flatId);
  const selectedFlatLabel = selectedFlat
    ? [selectedFlat.wingName ? `${selectedFlat.wingName}-` : "", selectedFlat.number].join("")
    : "—";
  function fillOwnerFields() {
    const owner = peopleOnFlat.find((r) => r.isOwner);
    setName(owner?.name ?? "");
    setPhone(owner?.phone ?? "");
    setEmail(owner?.email ?? "");
  }

  function clearPersonFields() {
    setName("");
    setPhone("");
    setEmail("");
  }

  function selectTab(next: HouseholdTabId) {
    tabTouchedRef.current = true;
    setTab(next);
    if (next === "owner") {
      setIsOwner(true);
      fillOwnerFields();
    }
    if (next === "family") {
      setIsOwner(false);
      clearPersonFields();
    }
    if (next === "parking") {
      setIsOwner(true);
      fillOwnerFields();
    }
  }

  const submitLabel = householdSubmitLabel(tab, {
    isOwnerTabEdit: true,
    hasOwner,
  });

  return (
    <ShPage full>
      <ShPageHeader
        title="Onboard residents"
        description="Pick a flat to see Owner, Family, Parking Details, vehicles, and Gas. Family members log in with their own mobile."
      />

      {message && (
        <p className="mb-3 text-sm text-[var(--leaf)]">{message}</p>
      )}
      {error && <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>}

      <form
        className="card sh-section space-y-3"
        onSubmit={onSubmit}
        data-testid="onboard-form"
      >
          <h2 className="text-sm font-semibold">Select the flat</h2>
          <p className="text-xs text-black/50">
            One owner per flat. Tabs below update as you change wing or flat.
          </p>
          <ShFormGrid>
            <ShField
              label="Society"
              htmlFor="onboard-society-name"
              className="sh-span-2"
            >
              <input
                id="onboard-society-name"
                data-testid="onboard-society-name"
                className="input bg-[var(--mist)]/50"
                value={societyName ?? "—"}
                readOnly
                disabled
              />
            </ShField>
            <WingFlatSelect
              flats={flats}
              value={flatId}
              onChange={setFlatId}
              wingHtmlFor="onboard-wing"
              flatHtmlFor="flat"
              wingTestId="onboard-wing"
              flatTestId="onboard-flat"
            />
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
          </ShFormGrid>
          {flatId ? (
            <ShTabs
              items={HOUSEHOLD_TABS}
              value={tab}
              onChange={selectTab}
              ariaLabel="Onboard details"
              testId="onboard-tabs"
              idPrefix="onboard"
            />
          ) : null}
          <p className="sr-only" data-testid="onboard-selected-flat">
            {selectedFlatLabel}
          </p>
          <ShFormGrid>
            {flatId && tab === "owner" && (
              <>
                <input type="hidden" data-testid="onboard-is-owner" value="true" />
                <HouseholdOwnerFields
                  testIdPrefix="onboard"
                  mode="edit"
                  hasOwner={hasOwner}
                  name={name}
                  phone={phone}
                  email={email}
                  emergencyContact={emergencyContact}
                  emergencyTestId="onboard-emergency"
                  onNameChange={setName}
                  onPhoneChange={setPhone}
                  onEmailChange={setEmail}
                  onEmergencyChange={setEmergencyContact}
                />
              </>
            )}
            {flatId && tab === "family" && (
              <>
            <p className="sh-span-2 text-xs text-black/50">
              Each family member needs their own mobile to log in and raise
              complaints.
            </p>
            <input type="hidden" data-testid="onboard-is-not-owner" value="true" />
            <FamilyMembersEditor
              people={peopleOnFlat}
              ownerLabel={
                ownerOnFlat
                  ? `${ownerOnFlat.name ?? "—"} · ${ownerOnFlat.phone ?? ""}`
                  : "No owner yet"
              }
              busy={familyBusy}
              error={familyError}
              testId="onboard-family"
              onSave={async (draft) => {
                setFamilyError(null);
                setFamilyBusy(true);
                try {
                  const res = await client.onboardResident({
                    name: draft.name,
                    phone: draft.phone,
                    flatId,
                    email: draft.email || null,
                    isOwner: false,
                    editUserId: draft.userId,
                    adultCount: Number(adultCount) || 0,
                    childCount: Number(childCount) || 0,
                    seniorCitizenCount: Number(seniorCitizenCount) || 0,
                  });
                  setMessage(
                    `${draft.userId ? "Updated" : "Added"} ${res.user.name} (${res.user.phone})`,
                  );
                  const people = await client.listResidents();
                  setResidents(people);
                } catch (err) {
                  setFamilyError(
                    err instanceof ApiClientError ? err.body.message : "Failed",
                  );
                  throw err;
                } finally {
                  setFamilyBusy(false);
                }
              }}
              onDelete={async (person) => {
                setFamilyError(null);
                setFamilyBusy(true);
                try {
                  await client.removeResident(person.userId);
                  setMessage(`Removed ${person.name ?? person.phone}`);
                  const people = await client.listResidents();
                  setResidents(people);
                } catch (err) {
                  setFamilyError(
                    err instanceof ApiClientError ? err.body.message : "Failed",
                  );
                  throw err;
                } finally {
                  setFamilyBusy(false);
                }
              }}
            />
            <HouseholdAgeCounts
              testIdPrefix="onboard"
              adultCount={adultCount}
              childCount={childCount}
              seniorCitizenCount={seniorCitizenCount}
              onAdultsChange={setAdultCount}
              onChildrenChange={setChildCount}
              onSeniorsChange={setSeniorCitizenCount}
            />
              </>
            )}
            {flatId && tab === "parking" && (
              <>
            <p className="sh-span-2 text-xs text-black/50">
              Pick a lot from Manage. Parking type must match how the lot was
              added (Puzzle vs Open). Lots already on another flat stay listed
              but cannot be assigned here.
            </p>
            <AllottedParkingFields
              parkings={parkings}
              parkingKind={parkingKind}
              parkingSlot={parkingSlot}
              parkingSlotId={parkingSlotId}
              flatId={flatId}
              testIdPrefix="onboard"
              onKindChange={(kind, slotNumber, slotId) => {
                setParkingKind(kind);
                setParkingSlot(slotNumber);
                setParkingSlotId(slotId);
              }}
              onSlotChange={(slotNumber, slotId) => {
                setParkingSlot(slotNumber);
                setParkingSlotId(slotId);
              }}
            />
              </>
            )}
            {flatId && tab === "two_wheeler" && (
              <VehicleFields
                kind="two_wheeler"
                label="Two-wheeler numbers"
                included={remainingIncluded(
                  flats.find((f) => f.id === flatId)?.twoWheelerCount,
                  INCLUDED_TWO_WHEELER_PARKING,
                )}
                rows={twoWheelers}
                onChange={setTwoWheelers}
              />
            )}
            {flatId && tab === "four_wheeler" && (
              <VehicleFields
                kind="four_wheeler"
                label="Four-wheeler numbers"
                included={remainingIncluded(
                  flats.find((f) => f.id === flatId)?.fourWheelerCount,
                  INCLUDED_FOUR_WHEELER_PARKING,
                )}
                rows={fourWheelers}
                onChange={setFourWheelers}
              />
            )}
            {flatId && tab === "gas" && (
              <PngGasFields
                name="png-gas"
                testIdPrefix="onboard"
                value={pngGasConnection}
                onChange={setPngGasConnection}
              />
            )}
          </ShFormGrid>
          {flatId ? (
            <button className="btn btn-primary" data-testid="onboard-submit" type="submit">
              {submitLabel}
            </button>
          ) : null}
      </form>

      <details className="card sh-section mt-3" data-testid="onboard-csv">
          <summary className="cursor-pointer text-sm font-semibold">
            Bulk import (CSV)
          </summary>
          <p className="mt-2 mb-2 text-[11px] leading-snug text-black/50">
            Match by phone. First person on a flat is the owner; later rows are
            family. Template headers include name, phone, flatNumber, wingName,
            isOwner, and household fields.
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
        </details>
    </ShPage>
  );
}
