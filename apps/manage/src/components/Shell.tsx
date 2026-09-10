import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { MANAGE_NAV, type ManageNavItem } from "../manage-nav";
import { Icon } from "./icons";

const APP_ORIGIN =
  import.meta.env.VITE_APP_ORIGIN ??
  import.meta.env.VITE_WEB_URL ??
  "http://app.localhost:5173";

function NavRow({ item, onNavigate }: { item: ManageNavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      data-testid={`nav-${item.to.slice(1)}`}
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
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.status === "soon" && (
        <span className="shrink-0 rounded-full bg-[var(--sand)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black/45">
          Soon
        </span>
      )}
    </NavLink>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, clearSession } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-4 pt-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--saffron)] to-[var(--leaf-dark)] text-sm font-bold text-white">
          SH
        </div>
        <div>
          <p className="font-display text-lg leading-tight text-[var(--leaf-dark)]">SocietyHub</p>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)]">
            Manage
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {MANAGE_NAV.map((item) => (
          <NavRow key={item.to} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="border-t border-[var(--sand)] px-3 py-3 lg:hidden">
        <NavRow
          item={{
            to: "/account",
            label: "Account",
            icon: "account",
            status: "live",
            blurb: "Your platform account",
          }}
          onNavigate={onNavigate}
        />
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
        <a
          href={APP_ORIGIN}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-[var(--leaf)] hover:bg-[var(--mist)]/70"
        >
          <Icon name="externalLink" className="h-4 w-4" />
          Open Client App
        </a>
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
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
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

      <div className="flex h-screen min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--sand)] bg-[#fffdfb]/80 px-4 py-3 backdrop-blur lg:hidden">
          <button
            type="button"
            data-testid="mobile-menu-button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--sand)]"
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" className="h-5 w-5" />
          </button>
          <p className="font-display text-lg text-[var(--leaf-dark)]">SocietyHub Manage</p>
          <NavLink
            to="/account"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--mist)] text-[var(--leaf-dark)]"
          >
            <Icon name="account" className="h-5 w-5" />
          </NavLink>
        </header>

        <header className="hidden items-center justify-between border-b border-[var(--sand)] px-8 py-4 lg:flex">
          <div />
          <div className="flex items-center gap-3">
            <span className="text-sm text-black/55">
              {user?.name} · <span className="capitalize">{user?.role}</span>
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

        <main className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-4 lg:px-8 lg:py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
