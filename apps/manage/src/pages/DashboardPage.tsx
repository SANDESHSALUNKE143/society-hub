import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SocietyDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { MANAGE_NAV } from "../manage-nav";
import { Icon } from "../components/icons";

const APP_URL =
  import.meta.env.VITE_APP_ORIGIN ??
  import.meta.env.VITE_WEB_URL ??
  "http://app.localhost:5173";

export function DashboardPage() {
  const { client, user } = useAuth();
  const [societies, setSocieties] = useState<SocietyDto[] | null>(null);

  useEffect(() => {
    client
      .listSocieties()
      .then(setSocieties)
      .catch(() => setSocieties([]));
  }, [client]);

  const live = MANAGE_NAV.filter((n) => n.status === "live");
  const soon = MANAGE_NAV.filter((n) => n.status === "soon");
  const count = societies?.length ?? null;

  return (
    <div data-testid="manage-dashboard">
      <div className="mb-6">
        <h1 className="font-display text-2xl">
          Welcome{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-black/55">
          Platform control center for SocietyHub employees.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/societies"
          className="kpi-card block transition-transform hover:-translate-y-0.5"
          data-testid="dashboard-kpi-societies"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Societies
          </p>
          <p className="mt-2 font-display text-3xl text-[var(--leaf-dark)]">
            {count === null ? "—" : count}
          </p>
        </Link>
        <div className="kpi-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Live Manage tools
          </p>
          <p className="mt-2 font-display text-3xl text-[var(--leaf-dark)]">{live.length}</p>
        </div>
        <div className="kpi-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Future metering
          </p>
          <p className="mt-2 font-display text-3xl text-[var(--leaf-dark)]">1</p>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Important actions</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link to="/societies" className="btn btn-primary text-sm" data-testid="dashboard-new-society">
              Manage societies
            </Link>
            <a
              className="btn btn-ghost text-sm"
              href={APP_URL}
              target="_blank"
              rel="noreferrer"
            >
              Open Client App
            </a>
            <Link to="/users" className="btn btn-ghost text-sm">
              User management
            </Link>
            <Link to="/subscriptions" className="btn btn-ghost text-sm">
              Subscriptions
            </Link>
            <Link to="/feature-flags" className="btn btn-ghost text-sm">
              Feature flags
            </Link>
            <Link to="/payments" className="btn btn-ghost text-sm">
              View payments
            </Link>
          </div>
          <p className="mt-4 text-xs text-black/45">
            Commercial nav items are live — assign plans, flags, and platform bills from the sidebar.
          </p>
        </div>

        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Recent societies</h2>
          {societies === null ? (
            <p className="text-sm text-black/50">Loading…</p>
          ) : societies.length === 0 ? (
            <p className="text-sm text-black/50">No societies yet — create one to get started.</p>
          ) : (
            <ul className="divide-y divide-[var(--sand)]">
              {societies.slice(0, 5).map((s) => (
                <li key={s.id} className="py-3">
                  <Link
                    to={`/societies/${s.id}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    <span className="shrink-0 text-xs text-black/40">
                      {[s.city, s.pincode].filter(Boolean).join(" · ") || "Open"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {societies && societies.length > 5 && (
            <Link to="/societies" className="mt-3 inline-block text-sm text-[var(--leaf)]">
              View all societies
            </Link>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-semibold">Still future</h2>
        <p className="mb-4 text-sm text-black/55">
          Usage metering and SMS quotas are not part of the demo commercial layer yet.
        </p>
        {soon.length === 0 ? (
          <p className="text-sm text-black/50">All Manage nav modules are live for the demo.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {soon.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="card block p-4 transition-transform hover:-translate-y-0.5"
                data-testid={`roadmap-${item.to.slice(1)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon name={item.icon} className="h-4 w-4 text-[var(--leaf)]" />
                    <span className="text-sm font-semibold">{item.label}</span>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--sand)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/50">
                    Soon
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-black/50">{item.blurb}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
