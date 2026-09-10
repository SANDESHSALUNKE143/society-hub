import type { ReactNode } from "react";
import type { ComplaintType } from "@society-hub/types";
import { complaintTypeIconName } from "./complaint-card";

const PATHS: Record<ComplaintType, ReactNode> = {
  plumbing: (
    <>
      <path d="M5 8h8v3H8v6" strokeLinecap="round" />
      <path d="M13 8V6a2 2 0 0 1 2-2h3" strokeLinecap="round" />
      <path d="M9 19c0 1.4-.7 2.5-1.5 2.5S6 20.4 6 19s.7-2 1.5-2 1.5.9 1.5 2Z" />
    </>
  ),
  lift: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1.5" />
      <path d="M12 8.5 9.5 11h5L12 8.5Z" fill="currentColor" stroke="none" />
      <path d="M12 15.5 14.5 13h-5L12 15.5Z" fill="currentColor" stroke="none" />
    </>
  ),
  electric: (
    <>
      <path d="M12 3c-2.8 2.2-4.5 4.6-4.5 7.2a4.5 4.5 0 1 0 9 0C16.5 7.6 14.8 5.2 12 3Z" />
      <path d="M10 17h4M10.5 20h3" strokeLinecap="round" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 5 6v6c0 4.2 2.8 7.2 7 8.5 4.2-1.3 7-4.3 7-8.5V6l-7-3Z" />
      <path d="m9.5 12 1.7 1.7 3.3-3.4" strokeLinecap="round" />
    </>
  ),
  housekeeping: (
    <>
      <path d="M8 20 18 6" strokeLinecap="round" />
      <path d="M16.2 5.2 19 8l1.6-1.6a1.4 1.4 0 0 0 0-2L18.8 3.6a1.4 1.4 0 0 0-2 0L16.2 5.2Z" />
      <path d="M5 20h6" strokeLinecap="round" />
    </>
  ),
  other: (
    <>
      <path d="M7 4h8l2 3v13H7V4Z" />
      <path d="M9 11h6M9 15h4" strokeLinecap="round" />
    </>
  ),
};

/** Web-only 24px SVG. Flutter uses Material icons in apps/mobile — do not share assets. */
export function ComplaintTypeIcon({
  type,
  size = 20,
}: {
  type: ComplaintType | string;
  size?: number;
}) {
  const name = complaintTypeIconName(type);
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      aria-hidden="true"
      data-complaint-type={name}
      style={{ width: size, height: size, display: "block", flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
