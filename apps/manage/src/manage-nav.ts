import type { IconName } from "./components/icons";

export type ManageNavItem = {
  to: string;
  label: string;
  icon: IconName;
  /** Live routes hit real APIs; soon routes render ComingSoonPage. */
  status: "live" | "soon";
  /** One-line blurb shown on Coming soon pages and Dashboard roadmap. */
  blurb: string;
};

/**
 * SocietyHub Manage = platform operations for SocietyHub employees.
 * Day-to-day society admin lives in the Client App.
 */
export const MANAGE_NAV: ManageNavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: "dashboard",
    status: "live",
    blurb: "Platform overview and quick actions.",
  },
  {
    to: "/societies",
    label: "Societies",
    icon: "societies",
    status: "live",
    blurb: "Create societies and add people to society teams.",
  },
  {
    to: "/users",
    label: "Users",
    icon: "users",
    status: "live",
    blurb:
      "Search and manage platform employees and society members across tenants — invite, suspend, reset access.",
  },
  {
    to: "/feature-flags",
    label: "Feature flags",
    icon: "toggle",
    status: "live",
    blurb:
      "Turn modules on or off per society (complaints, bills, payments, visitors, bookings, and more).",
  },
  {
    to: "/society-settings",
    label: "Society settings",
    icon: "settings",
    status: "live",
    blurb:
      "Enable or disable a society on the platform, set SLA defaults, branding, and support contacts.",
  },
  {
    to: "/subscriptions",
    label: "Subscriptions",
    icon: "subscription",
    status: "live",
    blurb:
      "Assign plans (Starter / Growth / Enterprise), seats, module packs, and billing cycles per society.",
  },
  {
    to: "/discounts",
    label: "Discounts",
    icon: "discount",
    status: "live",
    blurb: "Pilot discounts, coupon codes, and time-bound promotional pricing for societies.",
  },
  {
    to: "/bills",
    label: "Generate bills",
    icon: "bills",
    status: "live",
    blurb:
      "Generate platform subscription invoices for societies and mark platform fees as paid.",
  },
  {
    to: "/payments",
    label: "Payments",
    icon: "payments",
    status: "live",
    blurb:
      "View and reconcile Razorpay / manual platform payments by society; refunds and receipts.",
  },
  {
    to: "/announcements",
    label: "Announcements",
    icon: "notices",
    status: "live",
    blurb: "Broadcast platform-wide or segmented notices to society admins and residents.",
  },
  {
    to: "/audit",
    label: "Audit log",
    icon: "audit",
    status: "live",
    blurb: "Immutable trail of platform actions — who created societies, changed flags, billed whom.",
  },
  {
    to: "/integrations",
    label: "Integrations",
    icon: "integrations",
    status: "live",
    blurb: "MSG91 OTP, Resend email, Firebase push, Razorpay, and Azure Blob credentials per env.",
  },
  {
    to: "/support",
    label: "Support",
    icon: "support",
    status: "live",
    blurb: "Platform support inbox for society admins; escalate and track resolution.",
  },
];

export function manageNavByPath(path: string): ManageNavItem | undefined {
  return MANAGE_NAV.find((item) => item.to === path);
}

/** Remaining future ideas shown on society Controls (not nav Coming soon). */
export const SOCIETY_COMING_SOON = [
  {
    title: "Usage & limits",
    detail: "Flats, storage, SMS, and push quota against the subscribed plan.",
  },
] as const;
