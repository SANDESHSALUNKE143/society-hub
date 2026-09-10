import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { FlatDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { WingFlatSelect } from "@society-hub/ui";
import { useAuth } from "../auth";

export function OnboardPage() {
  const { user, client } = useAuth();
  const [flats, setFlats] = useState<FlatDto[]>([]);
  const [societyName, setSocietyName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [flatId, setFlatId] = useState("");
  const [adultCount, setAdultCount] = useState("0");
  const [childCount, setChildCount] = useState("0");
  const [seniorCitizenCount, setSeniorCitizenCount] = useState("0");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role !== "admin" && user?.role !== "superadmin") return;
    client.listFlats().then((rows) => {
      setFlats(rows);
      if (rows[0]) {
        setFlatId(rows[0].id);
        setAdultCount(String(rows[0].adultCount ?? 0));
        setChildCount(String(rows[0].childCount ?? 0));
        setSeniorCitizenCount(String(rows[0].seniorCitizenCount ?? 0));
      }
    });
    client
      .listMemberships()
      .then((rows) => {
        const mine = rows.find((r) => r.tenantId === user?.tenantId);
        if (mine) setSocietyName(mine.societyName);
      })
      .catch(() => undefined);
  }, [client, user]);

  if (user?.role !== "admin" && user?.role !== "superadmin") {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const res = await client.onboardResident({
        name,
        phone,
        flatId,
        email: email.trim() || null,
        adultCount: Number(adultCount) || 0,
        childCount: Number(childCount) || 0,
        seniorCitizenCount: Number(seniorCitizenCount) || 0,
      });
      setMessage(`Onboarded ${res.user.name} (${res.user.phone})`);
      setName("");
      setPhone("");
      setEmail("");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Failed");
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="font-display text-2xl">Onboard resident</h1>
      <p className="mt-1 text-sm text-black/55">
        Add a family member to a flat. Several people can share one flat — each
        needs their own mobile number.
      </p>
      <form className="card mt-6 space-y-4 p-6" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="onboard-society-name">
            Society (as Chairperson, you manage this society)
          </label>
          <input
            id="onboard-society-name"
            data-testid="onboard-society-name"
            className="input bg-[var(--mist)]/50"
            value={societyName ?? "—"}
            readOnly
            disabled
          />
        </div>
        <div>
          <label className="label" htmlFor="name">
            Resident name
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="onboard-email">
            Email (optional)
          </label>
          <input
            id="onboard-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <WingFlatSelect
            flats={flats}
            value={flatId}
            onChange={(id) => {
              setFlatId(id);
              const selected = flats.find((f) => f.id === id);
              setAdultCount(String(selected?.adultCount ?? 0));
              setChildCount(String(selected?.childCount ?? 0));
              setSeniorCitizenCount(String(selected?.seniorCitizenCount ?? 0));
            }}
            wingHtmlFor="onboard-wing"
            flatHtmlFor="flat"
            wingTestId="onboard-wing"
            flatTestId="onboard-flat"
          />
        </div>
        <p className="text-xs text-black/50">Family members in this flat</p>
        <div>
          <label className="label" htmlFor="onboard-adults">
            Adults
          </label>
          <input
            id="onboard-adults"
            className="input"
            type="number"
            min={0}
            max={50}
            value={adultCount}
            onChange={(e) => setAdultCount(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="onboard-children">
            Children
          </label>
          <input
            id="onboard-children"
            className="input"
            type="number"
            min={0}
            max={50}
            value={childCount}
            onChange={(e) => setChildCount(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="onboard-seniors">
            Senior citizens
          </label>
          <input
            id="onboard-seniors"
            className="input"
            type="number"
            min={0}
            max={50}
            value={seniorCitizenCount}
            onChange={(e) => setSeniorCitizenCount(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" data-testid="onboard-submit" type="submit">
          Onboard
        </button>
      </form>
      {message && <p className="mt-3 text-sm text-[var(--leaf)]">{message}</p>}
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    </div>
  );
}
