import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function ShTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  testId,
  idPrefix,
  className,
}: {
  items: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  testId?: string;
  idPrefix?: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cx("sh-tabs", className)} data-testid={testId}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
          aria-selected={value === item.id}
          data-testid={idPrefix ? `${idPrefix}-tab-${item.id}` : undefined}
          className="sh-tab"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ShTabPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
