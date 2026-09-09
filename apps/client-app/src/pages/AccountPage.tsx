import { FormEvent, useEffect, useState } from "react";
import type { ResidentProfileDto } from "@society-hub/types";
import {
  INCLUDED_FOUR_WHEELER_PARKING,
  INCLUDED_TWO_WHEELER_PARKING,
  vehicleParkingQuotaMessage,
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
import { VehicleFields } from "../components/VehicleFields";
import {
  draftsFromVehicles,
  otherHouseholdVehiclesForQuota,
  remainingIncludedForUser,
  toVehiclePayload,
  type VehicleDraft,
} from "../lib/vehicle-draft";

function vehiclesForAccountSave(
  flat: NonNullable<ResidentProfileDto["flat"]>,
  savedVehicles: ResidentProfileDto["vehicles"],
  twoWheelers: VehicleDraft[],
  fourWheelers: VehicleDraft[],
) {
  const myTwo = savedVehicles.filter((v) => v.kind === "two_wheeler").length;
  const myFour = savedVehicles.filter((v) => v.kind === "four_wheeler").length;
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

  function applyProfile(next: ResidentProfileDto) {
    setProfile(next);
    setEmergencyContact(next.emergencyContact ?? "");
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
      .then(applyProfile)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          vehicles,
        });
        applyProfile(next);
      } else {
        const next = await client.updateProfile({
          emergencyContact: emergencyContact || null,
        });
        applyProfile(next);
      }
      setProfileMessage("Profile updated.");
    } catch (err) {
      setProfileError(err instanceof ApiClientError ? err.body.message : "Failed");
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

      <ShSplit>
        <ShSection
          title="My flat"
          description="Society home linked to your account."
          testId="account-flat-details"
        >
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
        </ShSection>

        <ShSection
          title="Profile"
          description={
            flat
              ? "Household details are shared with everyone in this flat."
              : "For security and society records."
          }
        >
          <form className="space-y-2.5" onSubmit={saveProfile} data-testid="account-profile-form">
            <ShFormGrid>
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
              {flat ? (
                <>
                  <fieldset className="sh-span-2">
                    <legend className="label mb-1">PNG gas connection</legend>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="account-png-gas"
                          data-testid="account-png-yes"
                          checked={pngGasConnection}
                          onChange={() => setPngGasConnection(true)}
                        />
                        Taken
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="account-png-gas"
                          data-testid="account-png-no"
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
                      <ShField label="Adults" htmlFor="account-adults">
                        <input
                          id="account-adults"
                          data-testid="account-adults"
                          className="input"
                          type="number"
                          min={0}
                          max={50}
                          value={adultCount}
                          onChange={(e) => setAdultCount(e.target.value)}
                        />
                      </ShField>
                      <ShField label="Children" htmlFor="account-children">
                        <input
                          id="account-children"
                          data-testid="account-children"
                          className="input"
                          type="number"
                          min={0}
                          max={50}
                          value={childCount}
                          onChange={(e) => setChildCount(e.target.value)}
                        />
                      </ShField>
                      <ShField label="Senior citizens" htmlFor="account-seniors">
                        <input
                          id="account-seniors"
                          data-testid="account-seniors"
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
                    included={remainingTw}
                    rows={twoWheelers}
                    onChange={setTwoWheelers}
                    testIdPrefix="account"
                    registrationOptional
                  />
                  <VehicleFields
                    kind="four_wheeler"
                    label="Four-wheelers"
                    included={remainingFw}
                    rows={fourWheelers}
                    onChange={setFourWheelers}
                    testIdPrefix="account"
                    registrationOptional
                  />
                </>
              ) : (
                <p className="sh-span-2 text-sm text-black/55">
                  PNG, family counts, and vehicles can be updated after an admin links a flat.
                </p>
              )}
            </ShFormGrid>
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
