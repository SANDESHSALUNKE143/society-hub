import { useState } from "react";
import { createPortal } from "react-dom";
import type { SocietyResidentDto } from "@society-hub/types";
import { ShField, ShFormGrid } from "@society-hub/ui";
import { ConfirmDialog } from "./ConfirmDialog";

export type FamilyMemberDraft = {
  userId?: string;
  name: string;
  phone: string;
  email: string;
};

export function FamilyMembersEditor({
  people,
  ownerLabel,
  busy = false,
  error,
  testId = "family-members",
  readOnly = false,
  onSave,
  onDelete,
}: Readonly<{
  people: SocietyResidentDto[];
  ownerLabel?: string | null;
  busy?: boolean;
  error?: string | null;
  testId?: string;
  readOnly?: boolean;
  onSave?: (draft: FamilyMemberDraft) => Promise<void>;
  onDelete?: (person: SocietyResidentDto) => Promise<void>;
}>) {
  const rows = [...people].sort((a, b) => Number(b.isOwner) - Number(a.isOwner));
  const family = people.filter((person) => !person.isOwner);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SocietyResidentDto | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SocietyResidentDto | null>(null);

  function openAdd() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setDialogOpen(true);
  }

  function openEdit(person: SocietyResidentDto) {
    setEditing(person);
    setName(person.name ?? "");
    setPhone(person.phone ?? "");
    setEmail(person.email ?? "");
    setDialogOpen(true);
  }

  function closeDialog() {
    if (busy) return;
    setDialogOpen(false);
    setEditing(null);
  }

  async function submitDialog() {
    if (!onSave || !name.trim() || !phone.trim()) return;
    try {
      await onSave({
        userId: editing?.userId,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });
      setDialogOpen(false);
      setEditing(null);
    } catch {
      /* parent shows the error in the dialog */
    }
  }

  return (
    <div className="sh-span-2 space-y-3" data-testid={testId}>
      {ownerLabel ? (
        <p className="text-sm text-black/60" data-testid={`${testId}-owner`}>
          Owner · {ownerLabel}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">People in this flat</p>
        {!readOnly ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            data-testid={`${testId}-add`}
            disabled={busy}
            onClick={openAdd}
          >
            Add family member
          </button>
        ) : (
          <p className="text-xs text-black/50">
            Only the flat owner can add or remove family members.
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-black/55" data-testid={`${testId}-empty`}>
          None yet
        </p>
      ) : (
        <div className="table-wrap max-h-80 overflow-y-auto">
          <table className="data-table" data-testid={`${testId}-table`}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Mobile</th>
                <th>Email</th>
                {!readOnly ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((person) => (
                <tr key={person.userId}>
                  <td>{person.name ?? "—"}</td>
                  <td data-testid={`${testId}-role-${person.userId}`}>
                    {person.isOwner ? "Owner" : "Family"}
                  </td>
                  <td>{person.phone ?? "—"}</td>
                  <td>{person.email ?? "—"}</td>
                  {!readOnly ? (
                    <td>
                      {person.isOwner ? (
                        <span className="text-xs text-black/40">—</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            data-testid={`${testId}-edit-${person.userId}`}
                            disabled={busy}
                            onClick={() => openEdit(person)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--danger)] hover:bg-[var(--mist)]"
                            data-testid={`${testId}-delete-${person.userId}`}
                            disabled={busy}
                            aria-label={`Delete ${person.name ?? person.phone ?? "family member"}`}
                            onClick={() => setPendingDelete(person)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && family.length === 0 && rows.length > 0 ? (
        <p className="text-sm text-black/55" data-testid={`${testId}-empty`}>
          No family members yet
        </p>
      ) : null}

      {dialogOpen
        ? createPortal(
        <div
          className="sh-dialog-backdrop"
          data-testid={`${testId}-dialog-backdrop`}
          onClick={closeDialog}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${testId}-dialog-title`}
            className="sh-dialog"
            data-testid={`${testId}-dialog`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h3 id={`${testId}-dialog-title`} className="font-semibold">
                {editing ? "Edit family member" : "Add family member"}
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                data-testid={`${testId}-dialog-close`}
                disabled={busy}
                onClick={closeDialog}
              >
                Close
              </button>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submitDialog();
              }}
            >
              <ShFormGrid>
                <ShField label="Family member name" htmlFor={`${testId}-name`}>
                  <input
                    id={`${testId}-name`}
                    data-testid={`${testId}-name`}
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus
                  />
                </ShField>
                <ShField label="Contact number" htmlFor={`${testId}-phone`}>
                  <input
                    id={`${testId}-phone`}
                    data-testid={`${testId}-phone`}
                    className="input"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </ShField>
                <ShField label="Email" htmlFor={`${testId}-email`} className="sh-span-2">
                  <input
                    id={`${testId}-email`}
                    data-testid={`${testId}-email`}
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </ShField>
              </ShFormGrid>
              {error ? (
                <p className="text-sm text-[var(--danger)]" data-testid={`${testId}-dialog-error`}>
                  {error}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy}
                  onClick={closeDialog}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid={`${testId}-dialog-save`}
                  disabled={busy}
                  onClick={() => void submitDialog()}
                >
                  {editing ? "Update family member" : "Save family member"}
                </button>
              </div>
            </form>
          </div>
        </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remove family member"
        message={
          pendingDelete
            ? `Remove ${pendingDelete.name ?? pendingDelete.phone ?? "this person"} from this flat? They will not be able to log in for this society.`
            : ""
        }
        confirmLabel="Delete"
        busy={busy}
        testId={`${testId}-confirm-delete`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete || !onDelete) return;
          const person = pendingDelete;
          void onDelete(person).then(() => setPendingDelete(null));
        }}
      />
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M5 7h14" strokeLinecap="round" />
      <path d="M9 7V5h6v2" />
      <path d="M8 7l.8 12h6.4L16 7" />
    </svg>
  );
}
