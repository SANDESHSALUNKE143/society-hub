import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";
import { Icon, type IconName } from "./icons";
import { SocietySwitcher } from "./SocietySwitcher";

type NavItem = { to: string; label: string; icon: IconName };
type NavSection = { title: string; items: NavItem[] };

const adminSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    title: "Operations",
    items: [
      { to: "/complaints", label: "Complaints", icon: "complaints" },
      { to: "/residents", label: "Residents", icon: "team" },
      { to: "/onboard", label: "Onboard resident", icon: "onboard" },
      { to: "/invites", label: "Invites", icon: "invites" },
      { to: "/team", label: "Team", icon: "team" },
    ],
  },
  {
    title: "Finance",
    items: [
      { to: "/bills", label: "Bills", icon: "bills" },
      { to: "/payments", label: "Payments", icon: "payments" },
    ],
  },
  {
    title: "Communication",
    items: [
      { to: "/notices", label: "Notices", icon: "notices" },
      { to: "/notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    title: "Society",
    items: [
      { to: "/structure", label: "Structure", icon: "structure" },
      { to: "/visitors", label: "Visitors", icon: "visitors" },
      { to: "/parking", label: "Parking", icon: "parking" },
      { to: "/bookings", label: "Bookings", icon: "bookings" },
      { to: "/assets", label: "Assets", icon: "assets" },
      { to: "/vendors", label: "Vendors", icon: "vendors" },
      { to: "/events", label: "Events", icon: "events" },
    ],
  },
  {
    title: "System",
    items: [{ to: "/audit", label: "Audit log", icon: "audit" }],
  },
];

const residentSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", icon: "dashboard" }],
  },
  {
    title: "Complaints",
    items: [{ to: "/complaints", label: "My complaints", icon: "complaints" }],
  },
  {
    title: "Finance",
    items: [
      { to: "/bills", label: "Bills", icon: "bills" },
      { to: "/payments", label: "Payments", icon: "payments" },
    ],
  },
  {
    title: "Communication",
    items: [
      { to: "/notices", label: "Notices", icon: "notices" },
      { to: "/notifications", label: "Notifications", icon: "bell" },
    ],
  },
  {
    title: "Society",
    items: [
      { to: "/visitors", label: "Visitors", icon: "visitors" },
      { to: "/parking", label: "Parking", icon: "parking" },
      { to: "/bookings", label: "Clubhouse booking", icon: "bookings" },
    ],
  },
];

const MANAGE_URL = import.meta.env.VITE_MANAGE_URL ?? "http://manage.localhost:5174";

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-[var(--mist)] text-[var(--leaf-dark)]"
            : "text-[var(--ink)]/75 hover:bg-[var(--mist)]/70 hover:text-[var(--leaf-dark)]",
        ].join(" ")
      }
    >
      <Icon name={item.icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

function ModeToggle() {
  const { mode, setMode } = useAppMode();
  return (
    <div className="mb-4 space-y-1.5">
      <div
        className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--mist)]/60 p-1"
        data-testid="app-mode-toggle"
      >
        <button
          type="button"
          data-testid="app-mode-admin"
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "admin"
              ? "bg-white text-[var(--leaf-dark)] shadow-sm"
              : "text-[var(--ink)]/60 hover:text-[var(--leaf-dark)]",
          ].join(" ")}
          onClick={() => setMode("admin")}
        >
          Admin
        </button>
        <button
          type="button"
          data-testid="app-mode-resident"
          className={[
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            mode === "resident"
              ? "bg-white text-[var(--leaf-dark)] shadow-sm"
              : "text-[var(--ink)]/60 hover:text-[var(--leaf-dark)]",
          ].join(" ")}
          onClick={() => setMode("resident")}
        >
          Resident
        </button>
      </div>
      <p className="px-1 text-[10px] leading-snug text-black/40">
        Use Resident for your own flat — society presidents are often residents too.
      </p>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, clearSession } = useAuth();
  const { mode } = useAppMode();
  const showToggle = canUseAdminMode(user?.role);
  const effectiveMode = showToggle ? mode : "resident";
  const sections = effectiveMode === "admin" ? adminSections : residentSections;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-4 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--saffron)] to-[var(--leaf-dark)] text-sm font-bold text-white">
          SH
        </div>
        <div>
          <p className="font-display text-lg leading-tight text-[var(--leaf-dark)]">SocietyHub</p>
          {user?.flatNumber && (
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
              Flat {user.flatNumber}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pb-2">
        {showToggle && <ModeToggle />}
        <SocietySwitcher />
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-black/35">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavRow key={item.to} item={item} onNavigate={onNavigate} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--sand)] px-3 py-3 lg:hidden">
        <NavRow item={{ to: "/account", label: "Account", icon: "account" }} onNavigate={onNavigate} />
        <button
          type="button"
          data-testid="logout-button-mobile"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--ink)]/75 hover:bg-[var(--mist)]/70 hover:text-[var(--leaf-dark)]"
          onClick={clearSession}
        >
          <Icon name="logout" className="h-[18px] w-[18px]" />
          Log out
        </button>
      </div>

      <div className="border-t border-[var(--sand)] px-4 py-4">
        {user?.role === "superadmin" && (
          <a
            href={MANAGE_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--leaf)] hover:bg-[var(--mist)]/70"
          >
            <Icon name="externalLink" className="h-4 w-4" />
            Open Manage
          </a>
        )}
        {user?.name && (
          <p className="mt-2 truncate px-3 text-xs text-black/40">
            {user.name} · {user.role}
          </p>
        )}
      </div>
    </div>
  );
}

export function Shell() {
  const { user, clearSession } = useAuth();
  const { mode, setMode } = useAppMode();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Pure residents cannot use Admin mode. Staff/platform may freely switch
  // Admin ↔ Resident (presidents are often residents of a flat too).
  useEffect(() => {
    if (!user) return;
    if (!canUseAdminMode(user.role) && mode !== "resident") {
      setMode("resident");
    }
  }, [user, mode, setMode]);

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--sand)] bg-[#fffdfb] lg:block">
        <div className="fixed h-screen w-64">
          <SidebarContent />
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-[#fffdfb] shadow-xl">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--sand)] bg-[#fffdfb]/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            data-testid="mobile-menu-button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sand)]"
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <p className="font-display text-lg text-[var(--leaf-dark)]">SocietyHub</p>
          <NavLink
            to="/account"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mist)] text-[var(--leaf-dark)]"
          >
            <Icon name="account" className="h-5 w-5" />
          </NavLink>
        </header>

        <header className="hidden items-center justify-between border-b border-[var(--sand)] px-6 py-2.5 lg:flex">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-sm text-black/55">
              {user?.name}
              {user?.flatNumber ? ` · Flat ${user.flatNumber}` : ""}
            </span>
            <NavLink to="/account" className="btn btn-ghost btn-sm">
              Account
            </NavLink>
            <button
              type="button"
              data-testid="logout-button"
              className="btn btn-ghost btn-sm"
              onClick={clearSession}
            >
              Log out
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-4 lg:px-6 lg:py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
