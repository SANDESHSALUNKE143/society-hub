import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import type {
  ActivityEventDto,
  FamilyRelationship,
  ResidentDetailDto,
  ResidentDocumentType,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import {
  DOCUMENT_TYPE_LABELS,
  RELATIONSHIP_LABELS,
  RESIDENT_STATUS_LABELS,
  RESIDENT_TYPE_LABELS,
  ShConfirmDialog,
  ShDetailGrid,
  ShDetailItem,
  ShPage,
  ShPageHeader,
  ShSection,
  ShCountTabs,
  VERIFICATION_STATUS_LABELS,
  flatLabel,
  occupancyPeriod,
  residentStatusBadgeClass,
  verificationBadgeClass,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";
import {
  AssignTeamRoleDialog,
  staffRolesOf,
  type StaffRole,
} from "../components/AssignTeamRoleDialog";

type ActionKind =
  | "verify"
  | "reject"
  | "suspend"
  | "reactivate"
  | "moveOut"
  | "rejectDocument"
  | "removeFamily";

type PendingAction = { kind: ActionKind; targetId?: string };

const ACTION_COPY: Record<
  ActionKind,
  { title: string; confirmLabel: string; danger?: boolean; reasonLabel?: string; reasonRequired?: boolean; message: string }
> = {
  verify: {
    title: "Approve verification",
    confirmLabel: "Approve",
    message: "This marks the resident as verified and active in the society.",
  },
  reject: {
    title: "Reject verification",
    confirmLabel: "Reject",
    danger: true,
    reasonLabel: "Reason shown to the resident",
    reasonRequired: true,
    message: "The resident will see this reason and can re-submit documents.",
  },
  suspend: {
    title: "Suspend resident",
    confirmLabel: "Suspend",
    danger: true,
    reasonLabel: "Internal note",
    message: "The membership stays on the flat but is marked suspended.",
  },
  reactivate: {
    title: "Reactivate resident",
    confirmLabel: "Reactivate",
    message: "The membership becomes active again.",
  },
  moveOut: {
    title: "Move resident out",
    confirmLabel: "Move out",
    danger: true,
    reasonLabel: "Reason for moving out",
    message:
      "This closes the current occupancy period. The historical record is kept and stays visible under History.",
  },
  rejectDocument: {
    title: "Reject document",
    confirmLabel: "Reject",
    danger: true,
    reasonLabel: "Reason shown to the resident",
    reasonRequired: true,
    message: "The resident will be notified and can upload a replacement.",
  },
  removeFamily: {
    title: "Remove family member",
    confirmLabel: "Remove",
    danger: true,
    message: "This removes the household member from the flat record.",
  },
};

export function ResidentDetailPage() {
  const { id = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { client, user } = useAuth();
  const allowed = canUseAdminMode(user?.role);

  const [resident, setResident] = useState<ResidentDetailDto | null>(null);
  const [activity, setActivity] = useState<ActivityEventDto[]>([]);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignTeamOpen, setAssignTeamOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("assignTeam") === "1") {
      setAssignTeamOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("assignTeam");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    client
      .getResident(id)
      .then(setResident)
      .catch((err) =>
        setError(
          err instanceof ApiClientError ? err.body.message : "Could not load resident",
        ),
      )
      .finally(() => setLoading(false));
  }, [client, id]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed || tab !== "activity") return;
    client
      .listResidentActivity(id)
      .then(setActivity)
      .catch(() => setActivity([]));
  }, [client, id, tab, allowed]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  async function runAction(reason: string) {
    if (!pending || !resident) return;
    setBusy(true);
    setActionError(null);
    try {
      switch (pending.kind) {
        case "verify":
          setResident(await client.verifyResident(resident.id));
          setMessage("Verification approved.");
          break;
        case "reject":
          setResident(await client.rejectResident(resident.id, reason));
          setMessage("Verification rejected.");
          break;
        case "suspend":
          setResident(await client.suspendResident(resident.id, reason || null));
          setMessage("Resident suspended.");
          break;
        case "reactivate":
          setResident(await client.reactivateResident(resident.id));
          setMessage("Resident reactivated.");
          break;
        case "moveOut":
          setResident(await client.moveOutResident(resident.id, { reason: reason || null }));
          setMessage("Move-out recorded. History has been preserved.");
          break;
        case "rejectDocument":
          await client.rejectDocument(pending.targetId!, reason);
          load();
          setMessage("Document rejected.");
          break;
        case "removeFamily":
          await client.removeFamilyMember(resident.id, pending.targetId!);
          load();
          setMessage("Family member removed.");
          break;
      }
      setPending(null);
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.body.message : "Action failed",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-8">Loading…</p>;
  if (error || !resident) {
    return (
      <ShPage wide>
        <ShPageHeader title="Resident" />
        <div className="empty-state" data-testid="resident-error">
          <p className="text-[var(--danger)]">{error ?? "Resident not found"}</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={load}>
            Try again
          </button>
        </div>
      </ShPage>
    );
  }

  const occupying = resident.status !== "moved_out" && resident.status !== "rejected";
  const copy = pending ? ACTION_COPY[pending.kind] : null;
  const teamRoles = staffRolesOf(resident.roles);

  function onTeamAssigned(role: StaffRole) {
    setMessage(
      `Assigned as ${role}. They can use Admin mode after OTP login. Manage further on Team.`,
    );
    load();
  }

  return (
    <ShPage wide>
      <ShPageHeader
        title={resident.name ?? "Resident"}
        description={
          <>
            {flatLabel(resident.flat)} · {RESIDENT_TYPE_LABELS[resident.residentType]}
            {resident.isPrimary ? " (primary)" : " (co-resident)"} ·{" "}
            {resident.societyName ?? ""}
          </>
        }
        actions={
          <>
            {occupying && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="resident-assign-team"
                onClick={() => setAssignTeamOpen(true)}
              >
                {teamRoles.length ? "Add team role" : "Assign team role"}
              </button>
            )}
            {resident.verificationStatus !== "approved" && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                data-testid="resident-verify"
                onClick={() => setPending({ kind: "verify" })}
              >
                Approve
              </button>
            )}
            {resident.verificationStatus !== "rejected" && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="resident-reject"
                onClick={() => setPending({ kind: "reject" })}
              >
                Reject
              </button>
            )}
            {resident.status === "suspended" ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="resident-reactivate"
                onClick={() => setPending({ kind: "reactivate" })}
              >
                Reactivate
              </button>
            ) : (
              occupying && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  data-testid="resident-suspend"
                  onClick={() => setPending({ kind: "suspend" })}
                >
                  Suspend
                </button>
              )
            )}
            {occupying && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid="resident-move-out"
                onClick={() => setPending({ kind: "moveOut" })}
              >
                Move out
              </button>
            )}
          </>
        }
      />

      {message && (
        <p className="mb-3 text-sm text-[var(--leaf)]" data-testid="resident-message">
          {message}
        </p>
      )}

      <ShCountTabs
        testId="resident-tabs"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "family", label: "Family", count: resident.family.length },
          { id: "documents", label: "Documents", count: resident.documents.length },
          { id: "vehicles", label: "Vehicles", count: resident.vehicles.length },
          { id: "history", label: "History", count: resident.otherMemberships.length + 1 },
          { id: "activity", label: "Activity" },
        ]}
      />

      {tab === "overview" && (
        <div className="space-y-3">
          <ShSection title="Membership" testId="resident-membership">
            <ShDetailGrid>
              <ShDetailItem label="Status" testId="resident-status">
                <span className={residentStatusBadgeClass(resident.status)}>
                  {RESIDENT_STATUS_LABELS[resident.status]}
                </span>
              </ShDetailItem>
              <ShDetailItem label="Verification" testId="resident-verification">
                <span className={verificationBadgeClass(resident.verificationStatus)}>
                  {VERIFICATION_STATUS_LABELS[resident.verificationStatus]}
                </span>
              </ShDetailItem>
              <ShDetailItem label="Resident type">
                {RESIDENT_TYPE_LABELS[resident.residentType]}
              </ShDetailItem>
              <ShDetailItem label="Move-in" testId="resident-move-in-date">
                {resident.moveInDate?.slice(0, 10) ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Move-out" testId="resident-move-out-date">
                {resident.moveOutDate?.slice(0, 10) ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Roles">
                {resident.roles.length ? resident.roles.join(", ") : "—"}
                {teamRoles.length > 0 && (
                  <p className="mt-1 text-xs text-black/55">
                    On society team —{" "}
                    <Link to="/team" className="text-[var(--leaf-dark)]">
                      view Team
                    </Link>
                  </p>
                )}
              </ShDetailItem>
            </ShDetailGrid>
            {resident.rejectionReason && (
              <p className="mt-3 text-sm text-[var(--danger)]" data-testid="resident-rejection-reason">
                Rejection reason: {resident.rejectionReason}
              </p>
            )}
            {resident.moveOutReason && (
              <p className="mt-1 text-sm text-black/55">
                Move-out reason: {resident.moveOutReason}
              </p>
            )}
          </ShSection>

          <ShSection title="Society & flat" testId="resident-flat">
            <ShDetailGrid>
              <ShDetailItem label="Society">{resident.societyName ?? "—"}</ShDetailItem>
              <ShDetailItem label="Building">
                {resident.flat?.buildingName ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Wing">{resident.flat?.wingName ?? "—"}</ShDetailItem>
              <ShDetailItem label="Flat">
                {resident.flat ? (
                  <Link
                    className="text-[var(--leaf-dark)]"
                    to={`/flats/${resident.flat.id}`}
                    data-testid="resident-flat-link"
                  >
                    {flatLabel(resident.flat)}
                  </Link>
                ) : (
                  "—"
                )}
              </ShDetailItem>
              <ShDetailItem label="Floor">{resident.flat?.floor ?? "—"}</ShDetailItem>
              <ShDetailItem label="Parking">
                {resident.flat?.parkingSlot ?? "—"}
              </ShDetailItem>
            </ShDetailGrid>
          </ShSection>

          <ShSection title="Contact" testId="resident-contact">
            <ShDetailGrid>
              <ShDetailItem label="Phone">{resident.phone ?? "—"}</ShDetailItem>
              <ShDetailItem label="Email">{resident.email ?? "—"}</ShDetailItem>
              <ShDetailItem label="Emergency contact">
                {resident.emergencyContactName ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Relationship">
                {resident.emergencyContactRelation ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Emergency phone">
                {resident.emergencyContactPhone ?? "—"}
              </ShDetailItem>
              <ShDetailItem label="Vehicle">{resident.vehicleNumber ?? "—"}</ShDetailItem>
            </ShDetailGrid>
          </ShSection>
        </div>
      )}

      {tab === "family" && (
        <FamilyTab
          resident={resident}
          onChanged={load}
          onRemove={(familyId) => setPending({ kind: "removeFamily", targetId: familyId })}
        />
      )}

      {tab === "documents" && (
        <DocumentsTab
          resident={resident}
          onChanged={load}
          onReject={(docId) => setPending({ kind: "rejectDocument", targetId: docId })}
          onMessage={setMessage}
        />
      )}

      {tab === "vehicles" && (
        <ShSection
          title="Vehicles"
          description="Two-wheelers and four-wheelers recorded for this household."
          testId="resident-vehicles"
        >
          {resident.vehicles.length === 0 ? (
            <p className="empty-state">No vehicles recorded for this flat.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {resident.vehicles.map((v, i) => (
                <li key={`${v.kind}-${v.registrationNumber ?? i}`} className="flex items-center gap-2">
                  <span className="badge">
                    {v.kind === "two_wheeler" ? "Two-wheeler" : "Four-wheeler"}
                  </span>
                  <span className="font-medium">{v.registrationNumber ?? "No number"}</span>
                  {v.parkingSlot ? (
                    <span className="text-black/45">Slot {v.parkingSlot}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </ShSection>
      )}

      {tab === "history" && (
        <ShSection
          title="Membership history"
          description="Every occupancy period recorded for this person in this society."
          testId="resident-history"
        >
          <ul className="space-y-2 text-sm">
            <li className="rounded-lg border border-[var(--sand)] p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge badge-success">Current</span>
                <span className="font-medium">{flatLabel(resident.flat)}</span>
                <span className="text-black/55">
                  {RESIDENT_TYPE_LABELS[resident.residentType]}
                </span>
              </div>
              <p className="mt-1 text-xs text-black/50">
                {occupancyPeriod(resident.moveInDate, resident.moveOutDate)}
              </p>
            </li>
            {resident.otherMemberships.map((m) => (
              <li key={m.id} className="rounded-lg border border-[var(--sand)] p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={residentStatusBadgeClass(m.status)}>
                    {RESIDENT_STATUS_LABELS[m.status]}
                  </span>
                  <span className="font-medium">{flatLabel(m.flat)}</span>
                  <span className="text-black/55">
                    {RESIDENT_TYPE_LABELS[m.residentType]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-black/50">
                  {occupancyPeriod(m.moveInDate, m.moveOutDate)}
                </p>
              </li>
            ))}
          </ul>
        </ShSection>
      )}

      {tab === "activity" && (
        <ShSection
          title="Activity"
          description="Audit trail for this membership."
          testId="resident-activity"
        >
          {activity.length === 0 ? (
            <p className="empty-state">No recorded activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {activity.map((event) => (
                <li key={event.id} className="border-b border-[var(--sand)]/60 pb-2 last:border-0">
                  <p className="font-medium">{event.message ?? event.action}</p>
                  <p className="text-xs text-black/45">
                    {event.actorName ?? "System"} ·{" "}
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </ShSection>
      )}

      {copy && (
        <ShConfirmDialog
          open
          title={copy.title}
          message={copy.message}
          confirmLabel={copy.confirmLabel}
          danger={copy.danger}
          reasonLabel={copy.reasonLabel}
          reasonRequired={copy.reasonRequired}
          busy={busy}
          error={actionError}
          onConfirm={runAction}
          onCancel={() => {
            setPending(null);
            setActionError(null);
          }}
        />
      )}

      <AssignTeamRoleDialog
        open={assignTeamOpen}
        member={{
          userId: resident.userId,
          name: resident.name,
          phone: resident.phone,
          email: resident.email,
        }}
        existingRoles={resident.roles}
        onClose={() => setAssignTeamOpen(false)}
        onAssigned={onTeamAssigned}
      />
    </ShPage>
  );
}

function FamilyTab({
  resident,
  onChanged,
  onRemove,
}: {
  resident: ResidentDetailDto;
  onChanged: () => void;
  onRemove: (familyId: string) => void;
}) {
  const { client } = useAuth();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<FamilyRelationship>("spouse");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.addFamilyMember(resident.id, {
        name: name.trim(),
        relationship,
        phone: phone.trim() || null,
      });
      setName("");
      setPhone("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ShSection
      title="Family members"
      description="Household members. Adding one here does not create a login account."
      testId="resident-family"
    >
      {resident.family.length === 0 ? (
        <p className="empty-state">No family members recorded.</p>
      ) : (
        <ul className="mb-3 space-y-1.5 text-sm">
          {resident.family.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{f.name}</span>
              <span className="badge">{RELATIONSHIP_LABELS[f.relationship]}</span>
              {f.phone && <span className="text-black/45">{f.phone}</span>}
              {f.linkedUserId && <span className="badge badge-success">Has account</span>}
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-auto"
                data-testid={`family-remove-${f.id}`}
                onClick={() => onRemove(f.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-wrap items-end gap-2" onSubmit={add} data-testid="family-form">
        <div className="sh-field min-w-[10rem] flex-1">
          <label className="label" htmlFor="family-name">
            Name
          </label>
          <input
            id="family-name"
            className="input"
            value={name}
            required
            data-testid="family-name"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="sh-field min-w-[8rem]">
          <label className="label" htmlFor="family-relationship">
            Relationship
          </label>
          <select
            id="family-relationship"
            className="input"
            value={relationship}
            data-testid="family-relationship"
            onChange={(e) => setRelationship(e.target.value as FamilyRelationship)}
          >
            {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="sh-field min-w-[9rem]">
          <label className="label" htmlFor="family-phone">
            Phone
          </label>
          <input
            id="family-phone"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy} data-testid="family-add">
          {busy ? "Adding…" : "Add member"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </ShSection>
  );
}

function DocumentsTab({
  resident,
  onChanged,
  onReject,
  onMessage,
}: {
  resident: ResidentDetailDto;
  onChanged: () => void;
  onReject: (documentId: string) => void;
  onMessage: (message: string) => void;
}) {
  const { client } = useAuth();
  const [docType, setDocType] = useState<ResidentDocumentType>("identity");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await client.uploadResidentDocument(resident.id, file, { docType });
      onChanged();
      onMessage("Document uploaded.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function approve(documentId: string) {
    setError(null);
    try {
      await client.verifyDocument(documentId);
      onChanged();
      onMessage("Document approved.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Could not approve");
    }
  }

  const token = localStorage.getItem("sh_web_access") ?? "";
  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

  return (
    <ShSection
      title="Verification documents"
      description="Files are private — links open through an authenticated, audited download."
      testId="resident-documents"
    >
      {resident.documents.length === 0 ? (
        <p className="empty-state">No documents uploaded.</p>
      ) : (
        <ul className="mb-3 space-y-2 text-sm">
          {resident.documents.map((doc) => (
            <li
              key={doc.id}
              className="rounded-lg border border-[var(--sand)] p-2.5"
              data-testid={`document-${doc.id}`}
            >
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
                <div className="ml-auto flex gap-1.5">
                  {doc.status !== "approved" && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      data-testid={`document-approve-${doc.id}`}
                      onClick={() => approve(doc.id)}
                    >
                      Approve
                    </button>
                  )}
                  {doc.status !== "rejected" && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      data-testid={`document-reject-${doc.id}`}
                      onClick={() => onReject(doc.id)}
                    >
                      Reject
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-black/45">
                Uploaded {doc.uploadedAt.slice(0, 10)}
                {doc.verifiedByName ? ` · reviewed by ${doc.verifiedByName}` : ""}
                {doc.expiresAt ? ` · expires ${doc.expiresAt.slice(0, 10)}` : ""}
              </p>
              {doc.rejectionReason && (
                <p className="mt-1 text-xs text-[var(--danger)]">
                  Reason: {doc.rejectionReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="sh-field min-w-[10rem]">
          <label className="label" htmlFor="document-type">
            Document type
          </label>
          <select
            id="document-type"
            className="input"
            value={docType}
            data-testid="document-type"
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
          disabled={busy}
          data-testid="document-upload"
          onChange={(e) => void upload(e.target.files?.[0] ?? null)}
        />
      </div>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </ShSection>
  );
}
