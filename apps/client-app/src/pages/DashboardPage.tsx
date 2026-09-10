import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ComplaintDto, DashboardStatsDto } from "@society-hub/types";
import {
  ComplaintListCard,
  complaintFlatLabel,
  formatComplaintWhen,
} from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode, useAppMode } from "../app-mode";

function rupees(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/** Occupancy metric that doubles as a link into the matching filtered list. */
function OccupancyTile({
  to,
  label,
  value,
  testId,
}: {
  to: string;
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <Link to={to} className="kpi-card block transition-transform hover:-translate-y-0.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl text-[var(--leaf-dark)]" data-testid={testId}>
        {value}
      </p>
    </Link>
  );
}

export function DashboardPage() {
  const { client, user } = useAuth();
  const { mode } = useAppMode();
  const staffView = canUseAdminMode(user?.role) && mode === "admin";
  const [stats, setStats] = useState<DashboardStatsDto | null>(null);
  const [recent, setRecent] = useState<ComplaintDto[]>([]);

  useEffect(() => {
    client.getDashboardStats({ mine: !staffView }).then(setStats).catch(() => undefined);
    client
      .listComplaints(1, 4, { mine: !staffView })
      .then((res) => setRecent(res.items))
      .catch(() => undefined);
  }, [client, staffView]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-xl sm:text-2xl">
          Hello{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-0.5 text-sm text-black/55">
          {user?.flatNumber ? `Flat ${user.flatNumber}` : "Welcome to SocietyHub"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link to="/bills" className="kpi-card block transition-transform hover:-translate-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Dues outstanding</p>
          <p className="mt-2 font-display text-3xl text-[var(--leaf-dark)]">
            {stats ? rupees(stats.duesOutstandingPaise) : "—"}
          </p>
        </Link>
        <Link to="/complaints" className="kpi-card block transition-transform hover:-translate-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Open complaints</p>
          <p className="mt-2 font-display text-3xl text-[var(--leaf-dark)]">
            {stats?.openComplaints ?? "—"}
          </p>
        </Link>
        <Link to="/notices" className="kpi-card block transition-transform hover:-translate-y-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/45">Notices</p>
          <p className="mt-2 font-display text-3xl text-[var(--leaf-dark)]">
            {stats?.publishedNotices ?? "—"}
          </p>
        </Link>
      </div>

      {staffView && stats?.occupancy && (
        <section className="mt-5" data-testid="dashboard-occupancy">
          <h2 className="mb-2 font-semibold">Occupancy</h2>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <OccupancyTile
              to="/flats"
              label="Total flats"
              value={stats.occupancy.totalFlats}
              testId="occupancy-total-flats"
            />
            <OccupancyTile
              to="/flats?occupancy=owner_occupied"
              label="Owner occupied"
              value={stats.occupancy.ownerOccupiedFlats}
              testId="occupancy-owner-occupied"
            />
            <OccupancyTile
              to="/flats?occupancy=tenant_occupied"
              label="Tenant occupied"
              value={stats.occupancy.tenantOccupiedFlats}
              testId="occupancy-tenant-occupied"
            />
            <OccupancyTile
              to="/flats?occupancy=vacant"
              label="Vacant"
              value={stats.occupancy.vacantFlats}
              testId="occupancy-vacant"
            />
            <OccupancyTile
              to="/residents?status=active"
              label="Active residents"
              value={stats.occupancy.activeResidents}
              testId="occupancy-active-residents"
            />
            <OccupancyTile
              to="/residents"
              label="Total residents"
              value={stats.occupancy.totalResidents}
              testId="occupancy-total-residents"
            />
            <OccupancyTile
              to="/residents?verificationStatus=pending"
              label="Pending verification"
              value={stats.occupancy.pendingVerification}
              testId="occupancy-pending-verification"
            />
            <OccupancyTile
              to="/invites"
              label="Pending invitations"
              value={stats.occupancy.pendingInvitations}
              testId="occupancy-pending-invitations"
            />
            <OccupancyTile
              to="/residents?status=moved_out"
              label="Moved out"
              value={stats.occupancy.movedOut}
              testId="occupancy-moved-out"
            />
          </div>
        </section>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">{staffView ? "Recent complaints" : "Your recent complaints"}</h2>
            <Link to="/complaints" className="text-sm text-[var(--leaf)]">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-black/50">No complaints yet.</p>
          ) : (
            <div className="sh-complaint-list sh-complaint-list-inset">
              {recent.map((c) => (
                <Link key={c.id} to={`/complaints/${c.id}`} className="block">
                  <ComplaintListCard
                    type={c.type}
                    title={c.title}
                    location={complaintFlatLabel(c.flatNumber)}
                    when={formatComplaintWhen(c.createdAt)}
                    ticketNumber={c.ticketNumber}
                    status={c.status}
                  />
                </Link>
              ))}
            </div>
          )}
          <Link to="/complaints/new" className="btn btn-primary mt-4 w-full text-sm">
            Raise a complaint
          </Link>
        </div>

        <div className="card p-4">
          <h2 className="mb-2 font-semibold">Quick actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {staffView ? (
              <>
                <Link to="/onboard" className="btn btn-ghost text-sm">Onboard resident</Link>
                <Link to="/invites" className="btn btn-ghost text-sm">Send invite</Link>
                <Link to="/bills" className="btn btn-ghost text-sm">Generate bills</Link>
                <Link to="/notices" className="btn btn-ghost text-sm">New notice</Link>
              </>
            ) : (
              <>
                <Link to="/bills" className="btn btn-ghost text-sm">Pay dues</Link>
                <Link to="/bookings" className="btn btn-ghost text-sm">Book clubhouse</Link>
                <Link to="/visitors" className="btn btn-ghost text-sm">Expect visitor</Link>
                <Link to="/parking" className="btn btn-ghost text-sm">Parking</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
