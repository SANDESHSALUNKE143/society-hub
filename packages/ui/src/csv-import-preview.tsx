import { useEffect } from "react";
import { createPortal } from "react-dom";

export type CsvPreviewColumn = {
  key: string;
  header: string;
  render: (row: Record<string, unknown>, index: number) => string;
};

/**
 * Review parsed CSV rows in a grid before committing the import.
 */
export function CsvImportPreviewDialog({
  open,
  title,
  fileName,
  columns,
  rows,
  parseErrors = [],
  busy = false,
  error = null,
  confirmLabel = "Import",
  onCancel,
  onConfirm,
  testId = "csv-import-preview",
}: {
  open: boolean;
  title: string;
  fileName?: string | null;
  columns: CsvPreviewColumn[];
  rows: Array<Record<string, unknown>>;
  parseErrors?: Array<{ row: number; message: string }>;
  busy?: boolean;
  error?: string | null;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
  testId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const canImport = rows.length > 0 && !busy;

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
        className="sh-dialog sh-dialog-lg"
        data-testid={testId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={`${testId}-title`} className="font-semibold">
          {title}
        </h3>
        <p className="mt-1 text-sm text-black/55">
          Review the rows below, then import.
          {fileName ? (
            <>
              {" "}
              File: <span className="font-medium text-black/75">{fileName}</span>
            </>
          ) : null}{" "}
          · {rows.length} row{rows.length === 1 ? "" : "s"}
        </p>

        {parseErrors.length > 0 && (
          <ul
            className="mt-3 max-h-24 overflow-y-auto rounded-lg border border-[var(--sand)] bg-[var(--mist)]/40 px-3 py-2 text-xs text-[var(--danger)]"
            data-testid={`${testId}-parse-errors`}
          >
            {parseErrors.slice(0, 12).map((err) => (
              <li key={`${err.row}-${err.message}`}>
                Row {err.row}: {err.message}
              </li>
            ))}
            {parseErrors.length > 12 ? (
              <li>…and {parseErrors.length - 12} more</li>
            ) : null}
          </ul>
        )}

        {rows.length === 0 ? (
          <p className="mt-4 text-sm text-black/50" data-testid={`${testId}-empty`}>
            No valid rows to import. Fix the CSV and try again.
          </p>
        ) : (
          <div
            className="mt-4 max-h-[min(50vh,28rem)] overflow-auto rounded-lg border border-[var(--sand)]"
            data-testid={`${testId}-grid`}
          >
            <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[var(--mist)] text-[10px] font-bold uppercase tracking-wide text-black/45">
                <tr>
                  <th className="px-3 py-2">#</th>
                  {columns.map((col) => (
                    <th key={col.key} className="px-3 py-2">
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={index}
                    className="border-t border-[var(--sand)] odd:bg-white even:bg-[var(--mist)]/25"
                  >
                    <td className="px-3 py-1.5 text-xs text-black/40">{index + 1}</td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-1.5">
                        {col.render(row, index)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error ? (
          <p className="mt-3 text-sm text-[var(--danger)]" data-testid={`${testId}-error`}>
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={onCancel}
            data-testid={`${testId}-cancel`}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canImport}
            onClick={onConfirm}
            data-testid={`${testId}-confirm`}
          >
            {busy ? "Importing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
