import { useEffect, useState, type ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export type ShColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** Sort key sent to the API; omit for non-sortable columns. */
  sortKey?: string;
  className?: string;
};

export type ShSortState = { sort: string; order: "asc" | "desc" };

/**
 * List table with the four states every admin list needs: loading, error,
 * empty, and data. Sorting is delegated to the server via `onSortChange`.
 */
export function ShDataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  emptyMessage = "Nothing here yet.",
  onRetry,
  onRowClick,
  sort,
  onSortChange,
  testId,
}: {
  columns: ShColumn<T>[];
  rows: T[] | null;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: ReactNode;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  sort?: ShSortState;
  onSortChange?: (next: ShSortState) => void;
  testId?: string;
}) {
  function toggleSort(sortKey: string) {
    if (!onSortChange) return;
    const order: "asc" | "desc" =
      sort?.sort === sortKey && sort.order === "asc" ? "desc" : "asc";
    onSortChange({ sort: sortKey, order });
  }

  return (
    <div className="table-wrap" data-testid={testId}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={col.className}>
                {col.sortKey && onSortChange ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 uppercase tracking-[0.04em]"
                    onClick={() => toggleSort(col.sortKey!)}
                    data-testid={`sort-${col.sortKey}`}
                  >
                    {col.header}
                    <span aria-hidden="true" className="text-[0.6rem]">
                      {sort?.sort === col.sortKey
                        ? sort.order === "asc"
                          ? "▲"
                          : "▼"
                        : "↕"}
                    </span>
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty-state" data-testid="table-loading">
                  Loading…
                </div>
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty-state" data-testid="table-error">
                  <p className="text-[var(--danger)]">{error}</p>
                  {onRetry && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm mt-2"
                      onClick={onRetry}
                    >
                      Try again
                    </button>
                  )}
                </div>
              </td>
            </tr>
          )}
          {!loading && !error && rows?.length === 0 && (
            <tr>
              <td colSpan={columns.length}>
                <div className="empty-state" data-testid="table-empty">
                  {emptyMessage}
                </div>
              </td>
            </tr>
          )}
          {!loading &&
            !error &&
            rows?.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? "cursor-pointer" : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/** Server-side pagination control. Page numbers are 1-based. */
export function ShPagination({
  page,
  limit,
  total,
  onPageChange,
  testId = "pagination",
}: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  testId?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  return (
    <div
      className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-black/55"
      data-testid={testId}
    >
      <span data-testid={`${testId}-summary`}>
        {total === 0 ? "No results" : `${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          data-testid={`${testId}-prev`}
        >
          Previous
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          data-testid={`${testId}-next`}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** Search box + filter selects above a list. */
export function ShFilterBar({
  children,
  className,
  testId = "filter-bar",
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div
      className={cx(
        "card mb-3 flex flex-wrap items-end gap-2 p-3",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function ShSelect({
  label,
  value,
  onChange,
  options,
  id,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  id?: string;
  testId?: string;
}) {
  return (
    <div className="sh-field min-w-[8rem]">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input"
        value={value}
        data-testid={testId}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Blocking confirmation for destructive or hard-to-undo actions. `reasonLabel`
 * turns it into a reason-capture prompt (reject, move out, suspend).
 */
export function ShConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  reasonLabel,
  reasonRequired,
  busy,
  error,
  onConfirm,
  onCancel,
  testId = "confirm-dialog",
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  reasonLabel?: string;
  reasonRequired?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  testId?: string;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!open) return null;
  const blocked = Boolean(reasonRequired && reason.trim().length < 3);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid={testId}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="card relative w-full max-w-md p-4">
        <h2 className="font-display text-lg">{title}</h2>
        {message && <p className="mt-1 text-sm text-black/60">{message}</p>}
        {reasonLabel && (
          <div className="mt-3">
            <label className="label" htmlFor={`${testId}-reason`}>
              {reasonLabel}
              {reasonRequired ? " (required)" : " (optional)"}
            </label>
            <textarea
              id={`${testId}-reason`}
              className="input"
              value={reason}
              data-testid={`${testId}-reason`}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        {error && (
          <p className="mt-2 text-sm text-[var(--danger)]" data-testid={`${testId}-error`}>
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            disabled={busy}
            data-testid={`${testId}-cancel`}
          >
            Cancel
          </button>
          <button
            type="button"
            className={cx("btn btn-sm", danger ? "btn-ghost" : "btn-primary")}
            style={danger ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || blocked}
            data-testid={`${testId}-confirm`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Simple in-page tab strip for detail screens (supports optional counts). */
export function ShCountTabs({
  tabs,
  active,
  onChange,
  testId = "tabs",
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  active: string;
  onChange: (id: string) => void;
  testId?: string;
}) {
  return (
    <div
      className="mb-3 flex flex-wrap gap-1 border-b border-[var(--sand)]"
      role="tablist"
      data-testid={testId}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          data-testid={`${testId}-${tab.id}`}
          className={cx(
            "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === tab.id
              ? "border-[var(--leaf)] text-[var(--leaf-dark)]"
              : "border-transparent text-black/55 hover:text-[var(--leaf-dark)]",
          )}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="ml-1.5 text-[0.7rem] text-black/40">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Label + value pair used across the resident and flat detail screens. */
export function ShDetailItem({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-black/40">
        {label}
      </dt>
      <dd className="font-medium" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

export function ShDetailGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cx("grid grid-cols-2 gap-x-3 gap-y-2 text-sm sm:grid-cols-3", className)}>
      {children}
    </dl>
  );
}
