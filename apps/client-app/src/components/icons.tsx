import type { ReactElement, SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "complaints"
  | "onboard"
  | "invites"
  | "societies"
  | "structure"
  | "bills"
  | "payments"
  | "notices"
  | "bell"
  | "audit"
  | "team"
  | "visitors"
  | "parking"
  | "bookings"
  | "assets"
  | "vendors"
  | "events"
  | "account"
  | "logout"
  | "chevronDown"
  | "menu"
  | "close"
  | "externalLink"
  | "search"
  | "plus"
  | "back"
  | "mic"
  | "settings";

const paths: Record<IconName, ReactElement> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  complaints: (
    <>
      <path d="M4 4h16v12H8l-4 4V4Z" />
      <path d="M8 9h8M8 12.5h5" strokeLinecap="round" />
    </>
  ),
  onboard: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5" />
      <path d="M17 8h4M19 6v4" strokeLinecap="round" />
    </>
  ),
  invites: (
    <>
      <path d="M4 6h16v12H4V6Z" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  societies: (
    <>
      <path d="M4 21V9l8-5 8 5v12" />
      <path d="M9 21v-6h6v6M4 21h16" />
    </>
  ),
  structure: (
    <>
      <rect x="3" y="10" width="6" height="11" />
      <rect x="9.5" y="5" width="6" height="16" />
      <rect x="16" y="13" width="6" height="8" />
    </>
  ),
  bills: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 15h4" strokeLinecap="round" />
    </>
  ),
  notices: (
    <>
      <path d="M4 11a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  bell: (
    <>
      <path d="M5 11a7 7 0 0 1 14 0v4l1.5 3H3.5L5 15v-4Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  audit: (
    <>
      <path d="M9 3h9v15l-4.5 3-4.5-3V3Z" />
      <path d="M6 7H4v13a1 1 0 0 0 1 1h9" />
      <path d="M12 8h3M12 11.5h3" strokeLinecap="round" />
    </>
  ),
  team: (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M2.5 20c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M14.5 15.2c2.4.2 4.5 2 4.5 4.8" />
    </>
  ),
  visitors: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      <path d="M19 4v4M17 6h4" strokeLinecap="round" />
    </>
  ),
  parking: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 17V7h3.5a3 3 0 1 1 0 6H9" />
    </>
  ),
  bookings: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
      <path d="M8 14h2M13 14h3" strokeLinecap="round" />
    </>
  ),
  assets: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </>
  ),
  vendors: (
    <>
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" />
      <path d="M9 13a3 3 0 0 0 6 0" />
    </>
  ),
  events: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
      <circle cx="15.5" cy="15.5" r="2.2" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-4 3.3-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />,
  close: <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />,
  externalLink: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" strokeLinecap="round" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
  back: <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />,
  mic: (
    <>
      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" strokeLinecap="round" />
      <path d="M12 18v3M8 21h8" strokeLinecap="round" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
};

export function Icon({
  name,
  className,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
