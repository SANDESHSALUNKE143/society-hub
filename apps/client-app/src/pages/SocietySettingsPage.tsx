import { FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ApiClientError } from "@society-hub/sdk";
import { ShField, ShPage, ShPageHeader, ShSection } from "@society-hub/ui";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";

export function SocietySettingsPage() {
  const { client, user } = useAuth();
  const allowed = canUseAdminMode(user?.role);
  const [slaDays, setSlaDays] = useState(3);
  const [upiId, setUpiId] = useState("");
  const [payNote, setPayNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowed) return;
    client
      .getSocietySettings()
      .then((s) => {
        setSlaDays(s.slaDays);
        if (s.billingDefaults) {
          try {
            const parsed = JSON.parse(s.billingDefaults) as {
              upiId?: string;
              payNote?: string;
            };
            setUpiId(parsed.upiId ?? "");
            setPayNote(parsed.payNote ?? "");
          } catch {
            /* ignore */
          }
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load settings"),
      )
      .finally(() => setLoading(false));
  }, [allowed, client]);

  if (!allowed) return <Navigate to="/dashboard" replace />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await client.updateSocietySettings({
        slaDays,
        billingDefaults: JSON.stringify({ upiId: upiId.trim() || null, payNote: payNote.trim() || null }),
      });
      setMessage("Society settings saved");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.body.message : "Save failed");
    }
  }

  return (
    <ShPage>
      <ShPageHeader
        title="Society settings"
        description="Complaint SLA and payment details shown to residents."
      />
      <ShSection>
        {loading ? (
          <p className="text-sm text-black/55">Loading…</p>
        ) : (
          <form className="card max-w-lg space-y-3 p-4" onSubmit={onSave}>
            <ShField label="Complaint SLA (days)" htmlFor="slaDays">
              <input
                id="slaDays"
                className="input"
                type="number"
                min={1}
                max={30}
                value={slaDays}
                onChange={(e) => setSlaDays(Number(e.target.value))}
                required
              />
            </ShField>
            <ShField label="UPI ID (for maintenance payments)" htmlFor="upiId">
              <input
                id="upiId"
                className="input"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="society@upi"
              />
            </ShField>
            <ShField label="Payment note" htmlFor="payNote">
              <textarea
                id="payNote"
                className="input min-h-[4rem]"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="e.g. Include flat number in UPI remark"
              />
            </ShField>
            <button className="btn btn-primary" type="submit">
              Save settings
            </button>
            {message && <p className="text-sm text-[var(--leaf)]">{message}</p>}
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          </form>
        )}
      </ShSection>
    </ShPage>
  );
}
