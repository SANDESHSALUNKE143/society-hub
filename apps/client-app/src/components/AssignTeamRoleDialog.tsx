import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ApiClientError } from "@society-hub/sdk";
import type { Role } from "@society-hub/types";
import { useAuth } from "../auth";

export const TEAM_ROLES = [
  { value: "chairperson", label: "Chairperson" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "cashier", label: "Cashier" },
  { value: "committee", label: "Committee member" },
] as const;

export type StaffRole = (typeof TEAM_ROLES)[number]["value"];

const STAFF_ROLE_SET = new Set<string>(TEAM_ROLES.map((r) => r.value));
STAFF_ROLE_SET.add("admin");

export function staffRolesOf(roles: Role[]): string[] {
  return roles.filter((r) => STAFF_ROLE_SET.has(r));
}

function roleLabel(role: string) {
  return TEAM_ROLES.find((r) => r.value === role)?.label ?? role;
}

/**
 * Promote an existing society member onto the staff team (Admin mode access).
 * Uses POST /v1/team/members with the resident's userId.
 */
export function AssignTeamRoleDialog({
  open,
  member,
  existingRoles = [],
  onClose,
  onAssigned,
}: {
  open: boolean;
  member: {
    userId: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  existingRoles?: Role[];
  onClose: () => void;
  onAssigned: (role: StaffRole) => void;
}) {
  const { client } = useAuth();
  const [role, setRole] = useState<StaffRole>("committee");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStaff = staffRolesOf(existingRoles);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    const current = staffRolesOf(existingRoles);
    const firstFree =
      TEAM_ROLES.find((r) => !current.includes(r.value))?.value ?? "committee";
    setRole(firstFree);
  }, [open, existingRoles]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await client.addTeamMember({
        userId: member.userId,
        name: member.name ?? undefined,
        phone: member.phone,
        email: member.email,
        role,
      });
      onAssigned(role);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.body.message
          : "Could not assign team role",
      );
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="sh-dialog-backdrop"
      data-testid="assign-team-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-team-title"
        className="sh-dialog sh-dialog-sm"
        data-testid="assign-team-dialog"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h3 id="assign-team-title" className="font-semibold">
          Assign team role
        </h3>
        <p className="mt-1 text-sm text-black/55">
          Give {member.name ?? "this member"} Admin-mode access for this society.
          They keep their flat membership and can sign in with the same mobile
          (OTP).
        </p>
        {currentStaff.length > 0 && (
          <p className="mt-2 text-sm text-black/55" data-testid="assign-team-current">
            Current team roles:{" "}
            {currentStaff.map((r) => roleLabel(r)).join(", ")}
          </p>
        )}

        <form className="mt-4 space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label className="label" htmlFor="assign-team-role">
              Team role
            </label>
            <select
              id="assign-team-role"
              className="input"
              value={role}
              data-testid="assign-team-role"
              disabled={busy}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              {TEAM_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                  {currentStaff.includes(r.value) ? " (already assigned)" : ""}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-sm text-[var(--danger)]" data-testid="assign-team-error">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to="/team" className="mr-auto text-sm text-[var(--leaf-dark)]">
              Open Team
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              data-testid="assign-team-confirm"
              disabled={busy}
            >
              {busy ? "Assigning…" : "Assign role"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
