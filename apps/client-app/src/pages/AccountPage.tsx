import { FormEvent, useEffect, useState } from "react";
import type {
  CommunicationPreferences,
  ParkingKind,
  ParkingSlotDto,
  ResidentDocumentType,
  ResidentProfileDto,
  SocietyResidentDto,
} from "@society-hub/types";
import {
  INCLUDED_FOUR_WHEELER_PARKING,
  INCLUDED_TWO_WHEELER_PARKING,
  vehicleParkingQuotaMessage,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  DOCUMENT_TYPE_LABELS,
  HOUSEHOLD_TABS,
  RESIDENT_STATUS_LABELS,
  ShField,
  ShFormGrid,
  ShPage,
  ShPageHeader,
  ShSection,
  ShTabs,
  VERIFICATION_STATUS_LABELS,
  householdSubmitLabel,
  preferredParkingKind,
  residentStatusBadgeClass,
  verificationBadgeClass,
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
import {
  draftsFromVehicles,
  otherHouseholdVehiclesForQuota,
  remainingIncludedForUser,
  toVehiclePayload,
  type VehicleDraft,
} from "../lib/vehicle-draft";

type AccountSection = "flat" | "household" | "security";

const ACCOUNT_SECTIONS: Array<{ id: AccountSection; label: string }> = [
  { id: "flat", label: "My flat" },
  { id: "household", label: "Household" },
  { id: "security", label: "Security" },
];

const CHANNELS: Array<{
  key: keyof CommunicationPreferences;
  label: string;
  note?: string;
}> = [
  { key: "inApp", label: "In-app" },
  { key: "push", label: "Push", note: "Coming with the mobile app" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
];

function vehiclesForAccountSave(
  flat: NonNullable<ResidentProfileDto["flat"]>,
  savedVehicles: ResidentProfileDto["vehicles"],
  twoWheelers: VehicleDraft[],
  fourWheelers: VehicleDraft[],
) {
  const saved = savedVehicles ?? [];
  const myTwo = saved.filter((v) => v.kind === "two_wheeler").length;
  const myFour = saved.filter((v) => v.kind === "four_wheeler").length;
  const remainingTw = remainingIncludedForUser(
    flat.twoWheelerCount,
    myTwo,
    INCLUDED_TWO_WHEELER_PARKING,
  );
  const remainingFw = remainingIncludedForUser(
    flat.fourWheelerCount,
    myFour,
    INCLUDED_FOUR_WHEELER_PARKING,
  );
  const vehicles = [
    ...toVehiclePayload("two_wheeler", twoWheelers, remainingTw, { keepBlank: true }),
    ...toVehiclePayload("four_wheeler", fourWheelers, remainingFw, { keepBlank: true }),
  ];
  const quotaError = vehicleParkingQuotaMessage([
    ...otherHouseholdVehiclesForQuota({
      householdTwo: flat.twoWheelerCount,
      householdFour: flat.fourWheelerCount,
      myTwo,
      myFour,
    }),
    ...vehicles,
  ]);
  return { remainingTw, remainingFw, vehicles, quotaError };
}

export function AccountPage() {
  const { client, user, setSession } = useAuth();
  const isStaff = canUseAdminMode(user?.role);
  const [pin, setPin] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [pngGasConnection, setPngGasConnection] = useState(false);
  const [adultCount, setAdultCount] = useState("0");
  const [childCount, setChildCount] = useState("0");
  const [seniorCitizenCount, setSeniorCitizenCount] = useState("0");
  const [twoWheelers, setTwoWheelers] = useState<VehicleDraft[]>([]);
  const [fourWheelers, setFourWheelers] = useState<VehicleDraft[]>([]);
  const [profile, setProfile] = useState<ResidentProfileDto | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportSubject, setSupportSubject] = useState("");
  const [supportBody, setSupportBody] = useState("");
  const [household, setHousehold] = useState<SocietyResidentDto[]>([]);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyMessage, setFamilyMessage] = useState<string | null>(null);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [section, setSection] = useState<AccountSection>("flat");
  const [tab, setTab] = useState<HouseholdTabId>("owner");
  const [parkings, setParkings] = useState<ParkingSlotDto[]>([]);
  const [parkingKind, setParkingKind] = useState<ParkingKind>("puzzle");
  const [parkingSlot, setParkingSlot] = useState("");
  const [parkingSlotId, setParkingSlotId] = useState("");
  const [prefs, setPrefs] = useState<CommunicationPreferences | null>(null);
  const [docType, setDocType] = useState<ResidentDocumentType>("identity");
  const [uploadBusy, setUploadBusy] = useState(false);

  function applyProfile(next: ResidentProfileDto) {
    setProfile(next);
    setEmergencyContact(next.emergencyContact ?? "");
    setPrefs(next.communicationPreferences ?? null);
    setPngGasConnection(Boolean(next.flat?.pngGasConnection));
    setAdultCount(String(next.flat?.adultCount ?? 0));
    setChildCount(String(next.flat?.childCount ?? 0));
    setSeniorCitizenCount(String(next.flat?.seniorCitizenCount ?? 0));
    const vehicles = next.vehicles ?? [];
    if (vehicles.length === 0 && next.vehicleNumber) {
      setTwoWheelers([]);
      setFourWheelers([
        {
          id: crypto.randomUUID(),
          registrationNumber: next.vehicleNumber,
          parkingPurchased: false,
          parkingSlot: "",
        },
      ]);
      return;
    }
    setTwoWheelers(draftsFromVehicles(vehicles, "two_wheeler"));
    setFourWheelers(draftsFromVehicles(vehicles, "four_wheeler"));
  }

  useEffect(() => {
    client
      .getProfile()
      .then((next) => {
        applyProfile(next);
        if (next.flat) {
          client
            .listHouseholdMembers()
            .then((people) => {
              setHousehold(people);
              setFamilyError(null);
            })
            .catch((err) => {
              setHousehold([]);
              setFamilyError(err instanceof Error ? err.message : "Could not load family members");
            });
        }
      })
      .catch(() => undefined);
    client
      .listParkingSlots()
      .then((p) => setParkings(p.items))
      .catch(() => setParkings([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const selected = profile?.flat;
    if (!selected) return;
    const assigned =
      parkings.find((p) => p.flatId === selected.id) ??
      parkings.find((p) => p.slotNumber === selected.parkingSlot);
    const nextSlotId = assigned?.id ?? "";
    setParkingKind(preferredParkingKind(parkings, assigned, selected.id, nextSlotId));
    setParkingSlot(assigned?.slotNumber ?? selected.parkingSlot ?? "");
    setParkingSlotId(nextSlotId);
  }, [profile?.flat, parkings]);

  async function saveFamilyMember(draft: {
    userId?: string;
    name: string;
    phone: string;
    email: string;
  }) {
    setFamilyError(null);
    setFamilyMessage(null);
    setFamilyBusy(true);
    try {
      const res = draft.userId
        ? await client.updateHouseholdMember(draft.userId, {
            name: draft.name,
            phone: draft.phone,
            email: draft.email || null,
          })
        : await client.addHouseholdMember({
            name: draft.name,
            phone: draft.phone,
            email: draft.email || null,
          });
      setFamilyMessage(
        `${draft.userId ? "Updated" : "Added"} ${res.user.name ?? res.user.phone}. They can log in with this number and raise complaints.`,
      );
      setHousehold(await client.listHouseholdMembers());
    } catch (err) {
      setFamilyError(err instanceof ApiClientError ? err.body.message : "Failed");
      throw err;
    } finally {
      setFamilyBusy(false);
    }
  }

  async function savePin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await client.setPin(pin);
      if (user) {
        setSession(
          { ...user, hasPin: true },
          {
            accessToken: localStorage.getItem("sh_web_access")!,
            refreshToken: localStorage.getItem("sh_web_refresh")!,
            expiresIn: 900,
          },
        );
      }
      setMessage("PIN saved.");
      setPin("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (newPassword !== confirm) {
      setError("New passwords do not match");
      return;
    }
    try {
      await client.changePassword(currentPassword, newPassword);
      setMessage("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  async function submitSupport(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await client.createSupportTicket({
        subject: supportSubject.trim(),
        body: supportBody.trim(),
      });
      setMessage("Support ticket sent to SocietyHub.");
      setSupportSubject("");
      setSupportBody("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to send ticket");
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    const flat = profile?.flat ?? null;
    try {
      if (flat) {
        const { vehicles, quotaError } = vehiclesForAccountSave(
          flat,
          profile?.vehicles ?? [],
          twoWheelers,
          fourWheelers,
        );
        if (quotaError) {
          setProfileError(
            `${quotaError}. Included parking is per flat, across all family members.`,
          );
          return;
        }
        const next = await client.updateProfile({
          emergencyContact: emergencyContact || null,
          pngGasConnection,
          adultCount: Number(adultCount) || 0,
          childCount: Number(childCount) || 0,
          seniorCitizenCount: Number(seniorCitizenCount) || 0,
          parkingSlot: parkingSlot.trim() || null,
          parkingSlotId: parkingSlotId || null,
          vehicles,
          communicationPreferences: prefs ?? undefined,
        });
        applyProfile(next);
        try {
          setParkings((await client.listParkingSlots()).items);
        } catch {
          /* profile already saved */
        }
      } else {
        const next = await client.updateProfile({
          emergencyContact: emergencyContact || null,
          communicationPreferences: prefs ?? undefined,
        });
        applyProfile(next);
      }
      setProfileMessage("Profile updated.");
    } catch (err) {
      setProfileError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  async function uploadDocument(file: File | null) {
    if (!file) return;
    setUploadBusy(true);
    setProfileError(null);
    try {
      await client.uploadMyDocument(file, { docType });
      const next = await client.getProfile();
      applyProfile(next);
      setProfileMessage("Document uploaded — an admin will review it.");
    } catch (err) {
      setProfileError(err instanceof ApiClientError ? err.body.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  const flat = profile?.flat ?? null;
  const flatLabel = flat
    ? [flat.wingName ? `${flat.wingName}-` : "", flat.number].join("")
    : user?.flatNumber
      ? `Flat ${user.flatNumber}`
      : null;
  const myTwo = (profile?.vehicles ?? []).filter((v) => v.kind === "two_wheeler").length;
  const myFour = (profile?.vehicles ?? []).filter((v) => v.kind === "four_wheeler").length;
  const remainingTw = remainingIncludedForUser(
    flat?.twoWheelerCount,
    myTwo,
    INCLUDED_TWO_WHEELER_PARKING,
  );
  const remainingFw = remainingIncludedForUser(
    flat?.fourWheelerCount,
    myFour,
    INCLUDED_FOUR_WHEELER_PARKING,
  );
  const ownerOnFlat = household.find((person) => person.isOwner);
  const membership = profile?.membership ?? null;
  const documents = profile?.documents ?? [];
  const token = localStorage.getItem("sh_web_access") ?? "";
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

  return (
    <ShPage wide>
      <ShPageHeader
        title="Account"
        description={
          <>
            {user?.email ?? user?.phone ?? "No contact"} · {user?.role}
            {flatLabel
              ? ` · ${flatLabel.startsWith("Flat") ? flatLabel : `Flat ${flatLabel}`}`
              : ""}
          </>
        }
      />

      <ShSection>
        {membership ? (
          <div className="mb-4 space-y-2" data-testid="account-verification">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={verificationBadgeClass(membership.verificationStatus)}
                data-testid="account-verification-status"
              >
                {VERIFICATION_STATUS_LABELS[membership.verificationStatus]}
              </span>
              <span className={residentStatusBadgeClass(membership.status)}>
                {RESIDENT_STATUS_LABELS[membership.status]}
              </span>
            </div>
            {membership.verificationStatus === "rejected" && membership.rejectionReason && (
              <p className="text-sm text-[var(--danger)]" data-testid="account-rejection-reason">
                Reason: {membership.rejectionReason}
              </p>
            )}
          </div>
        ) : !flat ? (
          <p className="mb-4 text-sm text-black/55" data-testid="account-no-membership">
            You are not linked to a flat in this society yet. Ask an admin to add you.
          </p>
        ) : null}
        <ShTabs
          items={ACCOUNT_SECTIONS}
          value={section}
          onChange={setSection}
          ariaLabel="Account sections"
          testId="account-section-tabs"
          idPrefix="account-section"
          className="sh-tabs-lg"
        />

        {section === "flat" ? (
          <div data-testid="account-flat-details">
            {flat ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Society
                  </dt>
                  <dd className="font-medium" data-testid="account-society-name">
                    {profile?.societyName ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Flat
                  </dt>
                  <dd className="font-medium" data-testid="account-flat-number">
                    {flat.wingName ? `${flat.wingName}-${flat.number}` : flat.number}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Building
                  </dt>
                  <dd className="font-medium" data-testid="account-building-name">
                    {flat.buildingName ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Wing
                  </dt>
                  <dd className="font-medium" data-testid="account-wing-name">
                    {flat.wingName ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Floor
                  </dt>
                  <dd className="font-medium" data-testid="account-floor">
                    {flat.floor != null ? flat.floor : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Parking
                  </dt>
                  <dd className="font-medium" data-testid="account-parking">
                    {flat.parkingSlot ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    PNG gas
                  </dt>
                  <dd className="font-medium" data-testid="account-png">
                    {flat.pngGasConnection ? "Taken" : "Not taken"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Family members
                  </dt>
                  <dd className="font-medium" data-testid="account-family-counts">
                    {flat.adultCount ?? 0} adult{(flat.adultCount ?? 0) === 1 ? "" : "s"},{" "}
                    {flat.childCount ?? 0} child{(flat.childCount ?? 0) === 1 ? "" : "ren"},{" "}
                    {flat.seniorCitizenCount ?? 0} senior citizen
                    {(flat.seniorCitizenCount ?? 0) === 1 ? "" : "s"}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
                    Occupancy
                  </dt>
                  <dd className="font-medium" data-testid="account-occupancy">
                    {flat.isOwner ? "Owner" : "Tenant / occupant"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-black/55" data-testid="account-flat-empty">
                No flat linked yet. Ask an admin to onboard you.
              </p>
            )}
            <div className="mt-5" data-testid="account-documents">
              <h3 className="text-sm font-semibold">My documents</h3>
              <p className="mt-0.5 text-xs text-black/50">
                Only you and society admins can open these files.
              </p>
              {documents.length ? (
                <ul className="mt-3 mb-3 space-y-2 text-sm">
                  {documents.map((doc) => (
                    <li key={doc.id} className="rounded-lg border border-[var(--sand)] p-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="badge">{DOCUMENT_TYPE_LABELS[doc.docType]}</span>
                        <a
                          className="font-medium text-[var(--leaf-dark)]"
                          href={`${apiBase}${doc.downloadPath}?access_token=${encodeURIComponent(token)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {doc.fileName}
                        </a>
                        <span className={verificationBadgeClass(doc.status)}>
                          {VERIFICATION_STATUS_LABELS[doc.status]}
                        </span>
                      </div>
                      {doc.rejectionReason && (
                        <p className="mt-1 text-xs text-[var(--danger)]">
                          Reason: {doc.rejectionReason}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 mb-3 text-sm text-black/55">No documents uploaded yet.</p>
              )}
              {membership && (
                <div className="flex flex-wrap items-end gap-2">
                  <ShField label="Document type" htmlFor="account-doc-type" className="min-w-[10rem]">
                    <select
                      id="account-doc-type"
                      className="input"
                      value={docType}
                      data-testid="account-doc-type"
                      onChange={(e) => setDocType(e.target.value as ResidentDocumentType)}
                    >
                      {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </ShField>
                  <input
                    type="file"
                    className="text-xs"
                    accept="image/*,application/pdf"
                    disabled={uploadBusy}
                    data-testid="account-doc-upload"
                    onChange={(e) => void uploadDocument(e.target.files?.[0] ?? null)}
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}

        {section === "household" ? (
          <form className="space-y-2.5" onSubmit={saveProfile} data-testid="account-profile-form">
            {flat ? (
              <ShTabs
                items={HOUSEHOLD_TABS}
                value={tab}
                onChange={setTab}
                ariaLabel="Household details"
                testId="account-tabs"
                idPrefix="account"
              />
            ) : null}
            <ShFormGrid>
              {!flat && (
                <ShField label="Emergency contact" htmlFor="account-emergency-contact">
                  <input
                    id="account-emergency-contact"
                    data-testid="account-emergency-contact"
                    className="input"
                    placeholder="Name & phone"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                  />
                </ShField>
              )}
              {flat && tab === "owner" && (
                <HouseholdOwnerFields
                  testIdPrefix="account"
                  mode="readonly"
                  name={ownerOnFlat?.name ?? user?.name ?? ""}
                  phone={ownerOnFlat?.phone ?? user?.phone ?? ""}
                  email={ownerOnFlat?.email ?? user?.email ?? ""}
                  emergencyContact={emergencyContact}
                  onEmergencyChange={setEmergencyContact}
                />
              )}
              {flat && tab === "family" && (
                <>
                  <div className="sh-span-2" data-testid="account-family-members">
                    {familyMessage && (
                      <p
                        className="mb-2 text-sm text-[var(--leaf)]"
                        data-testid="account-family-message"
                      >
                        {familyMessage}
                      </p>
                    )}
                    <FamilyMembersEditor
                      people={household}
                      ownerLabel={
                        ownerOnFlat
                          ? `${ownerOnFlat.name ?? "—"} · ${ownerOnFlat.phone ?? ""}`
                          : "No owner yet"
                      }
                      busy={familyBusy}
                      error={familyError}
                      testId="account-family"
                      readOnly={!flat.isOwner}
                      onSave={flat.isOwner ? saveFamilyMember : undefined}
                      onDelete={
                        flat.isOwner
                          ? async (person) => {
                              setFamilyError(null);
                              setFamilyMessage(null);
                              setFamilyBusy(true);
                              try {
                                await client.removeHouseholdMember(person.userId);
                                setFamilyMessage(`Removed ${person.name ?? person.phone}`);
                                setHousehold(await client.listHouseholdMembers());
                              } catch (err) {
                                setFamilyError(
                                  err instanceof ApiClientError ? err.body.message : "Failed",
                                );
                                throw err;
                              } finally {
                                setFamilyBusy(false);
                              }
                            }
                          : undefined
                      }
                    />
                  </div>
                  <HouseholdAgeCounts
                    testIdPrefix="account"
                    adultCount={adultCount}
                    childCount={childCount}
                    seniorCitizenCount={seniorCitizenCount}
                    onAdultsChange={setAdultCount}
                    onChildrenChange={setChildCount}
                    onSeniorsChange={setSeniorCitizenCount}
                  />
                </>
              )}
              {flat && tab === "parking" && (
                <>
                  <p className="sh-span-2 text-xs text-black/50">
                    Pick a lot from Manage. Parking type must match how the lot was added
                    (Puzzle vs Open).
                  </p>
                  <AllottedParkingFields
                    parkings={parkings}
                    parkingKind={parkingKind}
                    parkingSlot={parkingSlot}
                    parkingSlotId={parkingSlotId}
                    flatId={flat.id}
                    testIdPrefix="account"
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
              {flat && tab === "two_wheeler" && (
                <VehicleFields
                  kind="two_wheeler"
                  label="Two-wheelers"
                  included={remainingTw}
                  rows={twoWheelers}
                  onChange={setTwoWheelers}
                  testIdPrefix="account"
                  registrationOptional
                />
              )}
              {flat && tab === "four_wheeler" && (
                <VehicleFields
                  kind="four_wheeler"
                  label="Four-wheelers"
                  included={remainingFw}
                  rows={fourWheelers}
                  onChange={setFourWheelers}
                  testIdPrefix="account"
                  registrationOptional
                />
              )}
              {flat && tab === "gas" && (
                <PngGasFields
                  name="account-png-gas"
                  testIdPrefix="account"
                  value={pngGasConnection}
                  onChange={setPngGasConnection}
                />
              )}
              {!flat && (
                <p className="sh-span-2 text-sm text-black/55">
                  PNG, family counts, parking, and vehicles can be updated after an admin
                  links a flat.
                </p>
              )}
            </ShFormGrid>
            <fieldset>
              <legend className="label">How we may contact you</legend>
              <div className="flex flex-wrap gap-3 text-xs">
                {CHANNELS.map((channel) => (
                  <label key={channel.key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      data-testid={`account-pref-${channel.key}`}
                      checked={prefs?.[channel.key] ?? false}
                      onChange={(e) =>
                        setPrefs((p) => ({
                          inApp: false,
                          push: false,
                          email: false,
                          whatsapp: false,
                          sms: false,
                          ...p,
                          [channel.key]: e.target.checked,
                        }))
                      }
                    />
                    {channel.label}
                    {channel.note && (
                      <span className="text-black/35">({channel.note})</span>
                    )}
                  </label>
                ))}
              </div>
            </fieldset>
            <button className="btn btn-primary" type="submit">
              {householdSubmitLabel(tab)}
            </button>
          </form>
        ) : null}

        {section === "security" ? (
          <div className="space-y-6">
            <form className="space-y-2.5" onSubmit={changePassword}>
              <h2 className="text-sm font-semibold">Reset password</h2>
              <p className="text-xs text-black/50">Change password while signed in.</p>
              <ShField label="Current password" htmlFor="currentPassword">
                <input
                  id="currentPassword"
                  className="input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </ShField>
              <ShFormGrid>
                <ShField label="New password" htmlFor="newPassword">
                  <input
                    id="newPassword"
                    className="input"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </ShField>
                <ShField label="Confirm" htmlFor="confirmPassword">
                  <input
                    id="confirmPassword"
                    className="input"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    minLength={8}
                    required
                  />
                </ShField>
              </ShFormGrid>
              <button className="btn btn-primary" type="submit">
                Update password
              </button>
            </form>
            <form className="space-y-2.5" onSubmit={savePin}>
              <h2 className="text-sm font-semibold">PIN</h2>
              <p className="text-xs text-black/50">4–6 digits for quick mobile login.</p>
              <div className="flex flex-wrap items-end gap-2">
                <ShField label="New PIN" htmlFor="pin" className="min-w-[10rem] flex-1">
                  <input
                    id="pin"
                    className="input"
                    type="password"
                    inputMode="numeric"
                    pattern="\d{4,6}"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                  />
                </ShField>
                <button className="btn btn-ghost" type="submit">
                  Save PIN
                </button>
              </div>
            </form>
            {isStaff ? (
              <form className="space-y-2.5" onSubmit={submitSupport} data-testid="account-support-form">
                <h2 className="text-sm font-semibold">Platform support</h2>
                <p className="text-xs text-black/50">
                  Open a ticket for SocietyHub Super Admin (billing, access, platform issues).
                </p>
                <ShField label="Subject" htmlFor="supportSubject">
                  <input
                    id="supportSubject"
                    className="input"
                    value={supportSubject}
                    onChange={(e) => setSupportSubject(e.target.value)}
                    required
                    minLength={3}
                  />
                </ShField>
                <ShField label="Details" htmlFor="supportBody">
                  <textarea
                    id="supportBody"
                    className="input min-h-[5rem]"
                    value={supportBody}
                    onChange={(e) => setSupportBody(e.target.value)}
                    required
                    minLength={10}
                  />
                </ShField>
                <button className="btn btn-primary" type="submit">
                  Send ticket
                </button>
              </form>
            ) : null}
          </div>
        ) : null}

        {section === "household" && profileMessage ? (
          <p className="mt-2 text-sm text-[var(--leaf)]">{profileMessage}</p>
        ) : null}
        {section === "household" && profileError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{profileError}</p>
        ) : null}
        {section === "flat" && profileMessage ? (
          <p className="mt-2 text-sm text-[var(--leaf)]">{profileMessage}</p>
        ) : null}
        {section === "flat" && profileError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{profileError}</p>
        ) : null}
        {section === "security" && message ? (
          <p className="mt-3 text-sm text-[var(--leaf)]">{message}</p>
        ) : null}
        {section === "security" && error ? (
          <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
        ) : null}
      </ShSection>
    </ShPage>
  );
}
