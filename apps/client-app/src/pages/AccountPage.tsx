import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  CommunicationPreferences,
  ResidentDocumentType,
  ResidentProfileDto,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  DOCUMENT_TYPE_LABELS,
  RELATIONSHIP_LABELS,
  RESIDENT_STATUS_LABELS,
  ShDetailGrid,
  ShDetailItem,
  ShField,
  ShFormGrid,
  ShPage,
  ShPageHeader,
  ShSection,
  ShSplit,
  VERIFICATION_STATUS_LABELS,
  residentStatusBadgeClass,
  verificationBadgeClass,
} from "@society-hub/ui";
import { useAuth } from "../auth";

const CHANNELS: Array<{ key: keyof CommunicationPreferences; label: string; note?: string }> = [
  { key: "inApp", label: "In-app" },
  { key: "push", label: "Push", note: "Coming with the mobile app" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
];

export function AccountPage() {
  const { client, user, setSession } = useAuth();
  const [pin, setPin] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyRelation, setEmergencyRelation] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [prefs, setPrefs] = useState<CommunicationPreferences | null>(null);
  const [profile, setProfile] = useState<ResidentProfileDto | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<ResidentDocumentType>("identity");
  const [uploadBusy, setUploadBusy] = useState(false);

  const load = useCallback(() => {
    client
      .getProfile()
      .then((next) => {
        setProfile(next);
        setName(next.name ?? "");
        setEmergencyName(next.emergencyContactName ?? "");
        setEmergencyRelation(next.emergencyContactRelation ?? "");
        setEmergencyPhone(next.emergencyContactPhone ?? next.emergencyContact ?? "");
        setVehicleNumber(next.vehicleNumber ?? "");
        setPrefs(next.communicationPreferences ?? null);
      })
      .catch(() => undefined);
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

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

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileMessage(null);
    try {
      const next = await client.updateProfile({
        name: name.trim() || undefined,
        emergencyContactName: emergencyName || null,
        emergencyContactRelation: emergencyRelation || null,
        emergencyContactPhone: emergencyPhone || null,
        vehicleNumber: vehicleNumber || null,
        communicationPreferences: prefs ?? undefined,
      });
      setProfile(next);
      setPrefs(next.communicationPreferences ?? null);
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
      load();
      setProfileMessage("Document uploaded — an admin will review it.");
    } catch (err) {
      setProfileError(err instanceof ApiClientError ? err.body.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  const flat = profile?.flat ?? null;
  const membership = profile?.membership ?? null;
  // Tolerate a slimmer payload (older API build, mocked fixture) rather than crash.
  const family = profile?.family ?? [];
  const documents = profile?.documents ?? [];
  const token = localStorage.getItem("sh_web_access") ?? "";
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

  return (
    <ShPage wide>
      <ShPageHeader
        title="My account"
        description={
          <>
            {user?.email ?? user?.phone ?? "No contact"} · {user?.role}
            {flat ? ` · Flat ${flat.wingName ? `${flat.wingName}-` : ""}${flat.number}` : ""}
          </>
        }
      />

      <ShSection
        title="Verification status"
        description="Sensitive details are changed by a society admin, not here."
        testId="account-verification"
      >
        {membership ? (
          <div className="space-y-2">
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
            {membership.verificationStatus === "approved" && (
              <p className="text-sm text-black/60">
                Your society membership is verified.
              </p>
            )}
            {(membership.verificationStatus === "pending" ||
              membership.verificationStatus === "under_review") && (
              <p className="text-sm text-black/60">
                Upload your documents below so an admin can verify your membership.
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-black/55" data-testid="account-no-membership">
            You are not linked to a flat in this society yet. Ask an admin to add you.
          </p>
        )}
      </ShSection>

      <ShSplit>
        <ShSection title="My society & flat" testId="account-flat-details">
          {flat ? (
            <ShDetailGrid className="sm:grid-cols-2">
              <ShDetailItem label="Society" testId="account-society-name">
                {profile?.societyName ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Flat" testId="account-flat-number">
                {flat.wingName ? `${flat.wingName}-${flat.number}` : flat.number}
              </ShDetailItem>
              <ShDetailItem label="Building" testId="account-building-name">
                {flat.buildingName ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Wing" testId="account-wing-name">
                {flat.wingName ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Floor" testId="account-floor">
                {flat.floor != null ? flat.floor : "—"}
              </ShDetailItem>
              <ShDetailItem label="Parking" testId="account-parking">
                {flat.parkingSlot ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Occupancy" testId="account-occupancy">
                {flat.isOwner ? "Owner" : "Tenant / occupant"}
              </ShDetailItem>
              <ShDetailItem label="Moved in">
                {membership?.moveInDate?.slice(0, 10) ?? "—"}
              </ShDetailItem>
            </ShDetailGrid>
          ) : (
            <p className="text-sm text-black/55" data-testid="account-flat-empty">
              No flat linked yet. Ask an admin to onboard you.
            </p>
          )}
        </ShSection>

        <ShSection title="My family" testId="account-family">
          {family.length ? (
            <ul className="space-y-1.5 text-sm">
              {family.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.name}</span>
                  <span className="badge">{RELATIONSHIP_LABELS[f.relationship]}</span>
                  {f.phone && <span className="text-black/45">{f.phone}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/55">
              No family members recorded. Ask an admin to add household members.
            </p>
          )}
        </ShSection>

        <ShSection
          title="My documents"
          description="Only you and society admins can open these files."
          testId="account-documents"
        >
          {documents.length ? (
            <ul className="mb-3 space-y-2 text-sm">
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
            <p className="mb-3 text-sm text-black/55">No documents uploaded yet.</p>
          )}

          {membership && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="sh-field min-w-[10rem]">
                <label className="label" htmlFor="account-doc-type">
                  Document type
                </label>
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
              </div>
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
        </ShSection>

        <ShSection title="Profile" description="Details you can change yourself.">
          <form className="space-y-2.5" onSubmit={saveProfile}>
            <ShFormGrid>
              <ShField label="Full name" htmlFor="account-name">
                <input
                  id="account-name"
                  data-testid="account-name"
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </ShField>
              <ShField label="Vehicle number" htmlFor="account-vehicle-number">
                <input
                  id="account-vehicle-number"
                  data-testid="account-vehicle-number"
                  className="input"
                  placeholder="MH12AB1234"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                />
              </ShField>
              <ShField label="Emergency contact name" htmlFor="account-emergency-name">
                <input
                  id="account-emergency-name"
                  data-testid="account-emergency-name"
                  className="input"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                />
              </ShField>
              <ShField label="Relationship" htmlFor="account-emergency-relation">
                <input
                  id="account-emergency-relation"
                  data-testid="account-emergency-relation"
                  className="input"
                  placeholder="Spouse, parent…"
                  value={emergencyRelation}
                  onChange={(e) => setEmergencyRelation(e.target.value)}
                />
              </ShField>
              <ShField
                label="Emergency contact phone"
                htmlFor="account-emergency-contact"
                className="sh-span-2"
              >
                <input
                  id="account-emergency-contact"
                  data-testid="account-emergency-contact"
                  className="input"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                />
              </ShField>
            </ShFormGrid>

            <fieldset className="mt-2">
              <legend className="label">How we may contact you</legend>
              <div className="flex flex-wrap gap-3 text-xs">
                {CHANNELS.map((channel) => (
                  <label key={channel.key} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      data-testid={`account-pref-${channel.key}`}
                      checked={prefs?.[channel.key] ?? false}
                      onChange={(e) =>
                        setPrefs((p) =>
                          p ? { ...p, [channel.key]: e.target.checked } : p,
                        )
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
              Save profile
            </button>
          </form>
          {profileMessage && (
            <p className="mt-2 text-sm text-[var(--leaf)]">{profileMessage}</p>
          )}
          {profileError && (
            <p className="mt-2 text-sm text-[var(--danger)]">{profileError}</p>
          )}
        </ShSection>

        <ShSection title="Reset password" description="Change password while signed in.">
          <form className="space-y-2.5" onSubmit={changePassword}>
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
        </ShSection>

        <ShSection title="PIN" description="4–6 digits for quick mobile login.">
          <form className="flex flex-wrap items-end gap-2" onSubmit={savePin}>
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
          </form>
        </ShSection>
      </ShSplit>

      {message && <p className="mt-3 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </ShPage>
  );
}
