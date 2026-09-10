import type { ReactNode } from "react";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Page chrome — prefer wide layouts for admin forms so paired panels fit above the fold. */
export function ShPage({
  children,
  className,
  wide,
  full,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
  full?: boolean;
}) {
  return (
    <div
      className={cx(
        "sh-page",
        wide && "sh-page-wide",
        full && "sh-page-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ShPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="sh-page-header">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl leading-tight sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-0.5 text-sm text-black/55">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ShSection({
  title,
  description,
  children,
  className,
  testId,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={cx("card sh-section", className)} data-testid={testId}>
      {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
      {description ? <p className="mt-0.5 text-xs text-black/55">{description}</p> : null}
      <div className={title || description ? "mt-3" : undefined}>{children}</div>
    </section>
  );
}

/** Compact label + control stack. */
export function ShField({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("sh-field", className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Responsive field grid — denser than stacked full-width forms. */
export function ShFormGrid({
  children,
  cols = 2,
  className,
}: {
  children: ReactNode;
  cols?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "sh-form-grid",
        cols === 1 && "sh-form-grid-1",
        cols === 2 && "sh-form-grid-2",
        cols === 3 && "sh-form-grid-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ShStack({
  children,
  className,
  gap = "md",
}: {
  children: ReactNode;
  className?: string;
  gap?: "sm" | "md" | "lg";
}) {
  return (
    <div
      className={cx(
        gap === "sm" && "space-y-2",
        gap === "md" && "space-y-3",
        gap === "lg" && "space-y-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Side-by-side panels on large screens (e.g. single onboard + CSV). */
export function ShSplit({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx("sh-split", className)}>{children}</div>;
}
