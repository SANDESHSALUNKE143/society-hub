import { FormEvent, useEffect, useState } from "react";
import type {
  IntegrationHealthDto,
  PlatformAnnouncementDto,
  PlatformBillDto,
  PlatformDiscountDto,
  PlatformPlanDto,
  PlatformSubscriptionDto,
  SocietyDto,
  SupportTicketDto,
} from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth";

const MODULES = [
  "complaints",
  "bills",
  "payments",
  "notices",
  "visitors",
  "parking",
  "bookings",
  "assets",
  "vendors",
  "events",
];

export function SubscriptionsPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [plans, setPlans] = useState<PlatformPlanDto[]>([]);
  const [subs, setSubs] = useState<PlatformSubscriptionDto[]>([]);
  const [societies, setSocieties] = useState<SocietyDto[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function load() {
    Promise.all([
      client.listPlatformPlans(),
      client.listPlatformSubscriptions(),
      client.listSocieties(),
    ])
      .then(([p, s, soc]) => {
        setPlans(p);
        setSubs(s);
        setSocieties(soc);
        if (!planId && p[0]) setPlanId(p[0].id);
        if (!tenantId && soc[0]) setTenantId(soc[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }
  useEffect(load, [client]);

  async function assign(e: FormEvent) {
    e.preventDefault();
    try {
      await client.assignPlatformSubscription({ tenantId, planId, cycle: "monthly" });
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Subscriptions</h1>
      <p className="text-sm text-black/55">Assign Starter / Growth / Enterprise per society.</p>
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
      <form className="card mt-4 flex flex-wrap gap-2 p-4" onSubmit={assign}>
        <select className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {societies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select className="input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>{p.name} (₹{(p.monthlyFeePaise / 100).toFixed(0)}/mo)</option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit">Assign plan</button>
      </form>
      <div className="table-wrap mt-4">
        <table className="data-table">
          <thead><tr><th>Society</th><th>Plan</th><th>Status</th></tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id}>
                <td>{societies.find((x) => x.id === s.tenantId)?.name ?? s.tenantId}</td>
                <td>{s.planName ?? s.planId}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FeatureFlagsPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [societies, setSocieties] = useState<SocietyDto[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    client.listSocieties().then((soc) => {
      setSocieties(soc);
      if (soc[0]) {
        setTenantId(soc[0].id);
        const raw = soc[0].featureFlagsJson;
        const list: string[] = raw ? JSON.parse(raw) : MODULES;
        const next: Record<string, boolean> = {};
        for (const m of MODULES) next[m] = list.includes(m);
        setFlags(next);
      }
    });
  }, [client]);

  useEffect(() => {
    const s = societies.find((x) => x.id === tenantId);
    if (!s) return;
    const raw = s.featureFlagsJson;
    const list: string[] = raw ? JSON.parse(raw) : MODULES;
    const next: Record<string, boolean> = {};
    for (const m of MODULES) next[m] = list.includes(m);
    setFlags(next);
  }, [tenantId, societies]);

  async function save() {
    setError(null);
    setMsg(null);
    try {
      const enabled = MODULES.filter((m) => flags[m]);
      await client.updateManageSocietySettings(tenantId, {
        featureFlagsJson: JSON.stringify(enabled),
      });
      setMsg("Flags saved");
      const soc = await client.listSocieties();
      setSocieties(soc);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Feature flags</h1>
      <p className="text-sm text-black/55">Modules enabled for a society in the Client App.</p>
      <select className="input mt-4 max-w-md" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
        {societies.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <ul className="card mt-4 divide-y divide-[var(--sand)] p-2">
        {MODULES.map((m) => (
          <li key={m} className="flex items-center justify-between px-3 py-2">
            <span className="capitalize">{m}</span>
            <input
              type="checkbox"
              checked={Boolean(flags[m])}
              onChange={(e) => setFlags((f) => ({ ...f, [m]: e.target.checked }))}
            />
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary mt-3" onClick={save}>Save flags</button>
      {msg && <p className="mt-2 text-sm text-[var(--leaf)]">{msg}</p>}
      {error && <p className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}

export function SocietySettingsManagePage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [societies, setSocieties] = useState<SocietyDto[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [slaDays, setSlaDays] = useState(3);
  const [status, setStatus] = useState<"active" | "suspended">("active");
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    client.listSocieties().then((soc) => {
      setSocieties(soc);
      if (soc[0]) {
        setTenantId(soc[0].id);
        setSlaDays(soc[0].slaDays ?? 3);
        setStatus(soc[0].status ?? "active");
      }
    });
  }, [client]);

  useEffect(() => {
    const s = societies.find((x) => x.id === tenantId);
    if (!s) return;
    setSlaDays(s.slaDays ?? 3);
    setStatus(s.status ?? "active");
  }, [tenantId, societies]);

  async function save() {
    await client.updateManageSocietySettings(tenantId, { slaDays, status });
    setMsg("Saved");
    setSocieties(await client.listSocieties());
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Society settings</h1>
      <p className="text-sm text-black/55">SLA defaults and suspend access.</p>
      <div className="card mt-4 grid max-w-lg gap-3 p-4">
        <select className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {societies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div>
          <label className="label">Complaint SLA (days)</label>
          <input className="input" type="number" min={1} value={slaDays} onChange={(e) => setSlaDays(Number(e.target.value))} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as "active" | "suspended")}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <button type="button" className="btn btn-primary" onClick={save}>Save</button>
        {msg && <p className="text-sm text-[var(--leaf)]">{msg}</p>}
      </div>
    </div>
  );
}

export function DiscountsPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [items, setItems] = useState<PlatformDiscountDto[]>([]);
  const [societies, setSocieties] = useState<SocietyDto[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [percentOff, setPercentOff] = useState(10);
  const [code, setCode] = useState("PILOT10");

  function load() {
    client.listPlatformDiscounts().then(setItems);
    client.listSocieties().then((s) => {
      setSocieties(s);
      if (s[0]) setTenantId(s[0].id);
    });
  }
  useEffect(load, [client]);

  async function create(e: FormEvent) {
    e.preventDefault();
    await client.createPlatformDiscount({ tenantId, percentOff, code });
    load();
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Discounts</h1>
      <form className="card mt-4 flex flex-wrap gap-2 p-4" onSubmit={create}>
        <select className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {societies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="input w-28" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" />
        <input className="input w-24" type="number" min={1} max={100} value={percentOff} onChange={(e) => setPercentOff(Number(e.target.value))} />
        <button className="btn btn-primary" type="submit">Add %</button>
      </form>
      <ul className="mt-4 space-y-2">
        {items.map((d) => (
          <li key={d.id} className="card px-4 py-3 text-sm">
            {d.code ?? "—"} · {d.percentOff != null ? `${d.percentOff}%` : `₹${(d.flatOffPaise ?? 0) / 100}`} · {d.tenantId ?? "all"}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlatformBillsPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [bills, setBills] = useState<PlatformBillDto[]>([]);
  const [societies, setSocieties] = useState<SocietyDto[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [periodYm, setPeriodYm] = useState(new Date().toISOString().slice(0, 7));

  function load() {
    client.listPlatformBills().then(setBills);
    client.listSocieties().then((s) => {
      setSocieties(s);
      if (s[0]) setTenantId(s[0].id);
    });
  }
  useEffect(load, [client]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    await client.generatePlatformBill({ tenantId, periodYm });
    load();
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Generate bills</h1>
      <p className="text-sm text-black/55">Platform subscription invoices (offline mark paid).</p>
      <form className="card mt-4 flex flex-wrap gap-2 p-4" onSubmit={generate}>
        <select className="input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
          {societies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input className="input" value={periodYm} onChange={(e) => setPeriodYm(e.target.value)} placeholder="YYYY-MM" />
        <button className="btn btn-primary" type="submit">Generate</button>
      </form>
      <div className="table-wrap mt-4">
        <table className="data-table">
          <thead><tr><th>Society</th><th>Period</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>
            {bills.map((b) => (
              <tr key={b.id}>
                <td>{b.societyName ?? b.tenantId}</td>
                <td>{b.periodYm}</td>
                <td>₹{(b.amountPaise / 100).toFixed(0)}</td>
                <td>{b.status}</td>
                <td>
                  {b.status === "issued" && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => client.markPlatformBillPaid(b.id).then(load)}>
                      Mark paid
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PlatformPaymentsPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [bills, setBills] = useState<PlatformBillDto[]>([]);
  useEffect(() => {
    client.listPlatformBills().then(setBills);
  }, [client]);
  const paid = bills.filter((b) => b.status === "paid");
  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Payments</h1>
      <p className="text-sm text-black/55">Paid platform invoices (offline).</p>
      <ul className="mt-4 space-y-2">
        {paid.length === 0 ? (
          <li className="empty-state">No paid platform invoices yet.</li>
        ) : (
          paid.map((b) => (
            <li key={b.id} className="card px-4 py-3 text-sm">
              {b.societyName} · {b.periodYm} · ₹{(b.amountPaise / 100).toFixed(0)} · paid
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function AnnouncementsPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [items, setItems] = useState<PlatformAnnouncementDto[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  function load() {
    client.listPlatformAnnouncements().then(setItems);
  }
  useEffect(load, [client]);

  async function publish(e: FormEvent) {
    e.preventDefault();
    await client.createPlatformAnnouncement({ title, body, audience: "all", publishNow: true });
    setTitle("");
    setBody("");
    load();
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Announcements</h1>
      <form className="card mt-4 grid gap-2 p-4" onSubmit={publish}>
        <input className="input" required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input" required rows={3} placeholder="Body" value={body} onChange={(e) => setBody(e.target.value)} />
        <button className="btn btn-primary" type="submit">Publish to all society staff</button>
      </form>
      <ul className="mt-4 space-y-2">
        {items.map((a) => (
          <li key={a.id} className="card px-4 py-3">
            <p className="font-medium">{a.title}</p>
            <p className="text-sm text-black/55">{a.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function IntegrationsPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [health, setHealth] = useState<IntegrationHealthDto | null>(null);
  useEffect(() => {
    client.getIntegrationsHealth().then(setHealth);
  }, [client]);
  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Integrations</h1>
      <p className="text-sm text-black/55">Read-only health — secrets stay in environment variables.</p>
      {health && (
        <ul className="card mt-4 divide-y divide-[var(--sand)]">
          {[
            ["MSG91 OTP", health.otpConfigured],
            ["Resend email", health.emailConfigured],
            ["Local file storage", health.storageLocal],
            ["Razorpay webhook secret", health.razorpayWebhookConfigured],
            ["Google SSO", health.googleSsoConfigured],
          ].map(([label, ok]) => (
            <li key={String(label)} className="flex justify-between px-4 py-3 text-sm">
              <span>{label}</span>
              <span className={ok ? "text-[var(--leaf)]" : "text-black/40"}>{ok ? "Configured" : "Not set"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SupportInboxPage() {
  const { client, user } = useAuth();
  const allowed = user?.role === "superadmin";
  const [tickets, setTickets] = useState<SupportTicketDto[]>([]);
  const [reply, setReply] = useState<Record<string, string>>({});

  function load() {
    client.listManageSupportTickets().then(setTickets);
  }
  useEffect(load, [client]);

  async function send(id: string) {
    await client.replySupportTicket(id, { reply: reply[id] ?? "", close: true });
    load();
  }

  if (!allowed) return <Navigate to="/login" replace />;
  return (
    <div>
      <h1 className="font-display text-2xl">Support</h1>
      <p className="text-sm text-black/55">Tickets from society staff.</p>
      <ul className="mt-4 space-y-3">
        {tickets.length === 0 ? (
          <li className="empty-state">No tickets.</li>
        ) : (
          tickets.map((t) => (
            <li key={t.id} className="card p-4">
              <p className="font-medium">{t.subject} · {t.status}</p>
              <p className="text-sm text-black/55">{t.societyName} — {t.body}</p>
              {t.reply && <p className="mt-1 text-sm">Reply: {t.reply}</p>}
              {t.status === "open" && (
                <div className="mt-2 flex gap-2">
                  <input className="input" value={reply[t.id] ?? ""} onChange={(e) => setReply((r) => ({ ...r, [t.id]: e.target.value }))} placeholder="Reply" />
                  <button type="button" className="btn btn-primary" onClick={() => send(t.id)}>Close with reply</button>
                </div>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
