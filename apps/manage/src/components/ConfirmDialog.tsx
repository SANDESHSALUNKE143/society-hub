import { useEffect, useRef, type ReactNode } from "react";

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
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    if (!el.open) el.showModal();
    return () => {
      if (el.open) el.close();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      className="sh-dialog sh-dialog-sm"
      data-testid={testId}
      aria-labelledby={`${testId}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 id={`${testId}-title`} className="font-semibold">
          {title}
        </h3>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          data-testid={`${testId}-close`}
          disabled={busy}
          onClick={onCancel}
        >
          Close
        </button>
      </div>
      <p className="text-sm text-black/65">{message}</p>
      {error && (
        <p className="mt-3 text-sm text-[var(--danger)]" data-testid={`${testId}-error`}>
          {error}
        </p>
      )}
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
    </dialog>
  );
}
