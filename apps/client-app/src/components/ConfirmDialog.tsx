import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  busy = false,
  error,
  onCancel,
  onConfirm,
  testId = "confirm-dialog",
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  testId?: string;
}) {
  if (!open) return null;

  return createPortal(
    <div
      className="sh-dialog-backdrop"
      data-testid={`${testId}-backdrop`}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testId}-title`}
        className="sh-dialog sh-dialog-sm"
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={`${testId}-title`} className="font-semibold">
          {title}
        </h3>
        <p className="mt-2 text-sm text-black/65">{message}</p>
        {error ? (
          <p className="mt-3 text-sm text-[var(--danger)]" data-testid={`${testId}-error`}>
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            data-testid={`${testId}-cancel`}
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            data-testid={`${testId}-confirm`}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
