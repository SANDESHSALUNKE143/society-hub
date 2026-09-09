import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import type { SocietyDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { Icon } from "../components/icons";
import { SOCIETY_COMING_SOON } from "../manage-nav";

const APP_URL =
  import.meta.env.VITE_APP_ORIGIN ??
  import.meta.env.VITE_WEB_URL ??
  "http://app.localhost:5173";

const TEAM_ROLES = [
  { value: "chairperson", label: "Chairperson" },
  { value: "secretary", label: "Secretary" },
  { value: "treasurer", label: "Treasurer" },
  { value: "cashier", label: "Cashier" },
  { value: "committee", label: "Committee member" },
] as const;

function AddTeamMemberForm({ societyId }: { societyId: string }) {
  const { client } = useAuth();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<(typeof TEAM_ROLES)[number]["value"]>("chairperson");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await client.addSocietyTeamMember(societyId, {
        email: email || undefined,
        phone: phone || undefined,
        name: name || undefined,
        role,
      });
      setMessage(
        `Added as ${res.role} on ${res.societyName}. They can sign in with this mobile (OTP) at ${APP_URL} in Admin mode.`,
      );
      setEmail("");
      setPhone("");
      setName("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed to add team member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card grid gap-4 p-5 sm:grid-cols-2"
      data-testid="add-team-form"
      onSubmit={submit}
    >
      <div>
        <label className="label" htmlFor="team-email">
          Email
        </label>
        <input
          id="team-email"
          data-testid="add-team-email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="team-phone">
          Mobile
        </label>
        <input
          id="team-phone"
          data-testid="add-team-phone"
          className="input"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          minLength={10}
          maxLength={15}
          placeholder="10-digit mobile"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="team-name">
          Name (optional)
        </label>
        <input
          id="team-name"
          data-testid="add-team-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <label className="label" htmlFor="team-role">
          Role
        </label>
        <select
          id="team-role"
          data-testid="add-team-role"
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as (typeof TEAM_ROLES)[number]["value"])}
        >
          {TEAM_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-end">
        <button
          className="btn btn-primary"
          data-testid="add-team-submit"
          disabled={busy}
          type="submit"
        >
          Add to society team
        </button>
      </div>
      {message && <p className="sm:col-span-2 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="sm:col-span-2 text-sm text-[var(--danger)]">{error}</p>}
    </form>
  );
}

export function SocietyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { client, user } = useAuth();
  const [society, setSociety] = useState<SocietyDto | null>(null);

  useEffect(() => {
    if (!id) return;
    client.getSociety(id).then(setSociety).catch(() => undefined);
  }, [client, id]);

  if (user?.role !== "superadmin") {
    return <Navigate to="/login" replace />;
  }
  if (!id) return null;

  return (
    <div>
      <Link to="/societies" className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--leaf)]">
        <Icon name="back" className="h-4 w-4" />
        All societies
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl">{society?.name ?? "Society"}</h1>
          <p className="mt-1 text-sm text-black/55">
            {[society?.city, society?.pincode].filter(Boolean).join(" · ") ||
              society?.address ||
              ""}
          </p>
          {society?.chairpersonName && (
            <p className="mt-1 text-sm text-black/55">
              Chairperson: {society.chairpersonName}
              {society.chairpersonPhone ? ` · ${society.chairpersonPhone}` : ""}
              {society.chairpersonEmail ? ` · ${society.chairpersonEmail}` : ""}
            </p>
          )}
        </div>
        <a className="btn btn-ghost text-sm" href={APP_URL} target="_blank" rel="noreferrer">
          Open Client App
        </a>
      </div>

      <h2 className="mb-3 font-semibold">Add to society team</h2>
      <p className="mb-3 text-sm text-black/55">
        SocietyHub employees who need Client App Admin access must be added here. Include
        their mobile number so they can sign in with OTP. Day-to-day society management
        (residents, complaints, bills) happens in the Client App.
      </p>
      <AddTeamMemberForm societyId={id} />

      <div className="mt-10" data-testid="society-planned-controls">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Platform controls for this society</h2>
          <span className="rounded-full bg-[var(--sand)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black/50">
            Coming soon
          </span>
        </div>
        <p className="mb-4 text-sm text-black/55">
          Planned per-society controls. Shown for roadmap visibility — toggles are disabled
          and do not save.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIETY_COMING_SOON.map((row) => (
            <div
              key={row.title}
              className="card flex items-start justify-between gap-3 p-4 opacity-80"
            >
              <div>
                <p className="text-sm font-medium">{row.title}</p>
                <p className="mt-1 text-xs text-black/50">{row.detail}</p>
              </div>
              <button
                type="button"
                className="relative h-6 w-11 shrink-0 rounded-full bg-black/15"
                disabled
                aria-disabled="true"
                title="Coming soon"
              >
                <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/feature-flags" className="btn btn-ghost text-sm">
            Global feature flags
          </Link>
          <Link to="/subscriptions" className="btn btn-ghost text-sm">
            Subscriptions
          </Link>
          <Link to="/payments" className="btn btn-ghost text-sm">
            Payments
          </Link>
        </div>
      </div>
    </div>
  );
}
