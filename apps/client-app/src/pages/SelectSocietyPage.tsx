import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import type { MembershipDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { uniqueMembershipsBySociety } from "@society-hub/ui";
import { useAuth } from "../auth";

export function SelectSocietyPage() {
  const { user, client, setSession } = useAuth();
  const navigate = useNavigate();
  const [memberships, setMemberships] = useState<MembershipDto[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .listMemberships()
      .then((rows) => setMemberships(uniqueMembershipsBySociety(rows)))
      .catch(() => setMemberships([]));
  }, [client]);

  if (!user) return <Navigate to="/login" replace />;

  // Nothing to choose from, or the API doesn't support memberships yet — go straight in.
  if (memberships !== null && memberships.length <= 1) {
    return <Navigate to="/dashboard" replace />;
  }

  async function pick(tenantId: string) {
    setBusy(tenantId);
    setError(null);
    try {
      const res = await client.selectTenant(tenantId);
      setSession(res.user, res.tokens);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.body.message
          : err instanceof Error
            ? err.message
            : "Could not switch society",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="font-display text-2xl text-[var(--leaf-dark)]">Choose your society</p>
          <p className="mt-1 text-sm text-black/55">
            You belong to more than one society. Pick one to continue.
          </p>
        </div>

        <div className="card divide-y divide-[var(--sand)]" data-testid="select-society-list">
          {memberships === null && (
            <p className="px-5 py-6 text-sm text-black/50">Loading your societies…</p>
          )}
          {memberships?.map((m) => (
            <button
              key={m.tenantId}
              type="button"
              data-testid="select-society-option"
              disabled={busy !== null}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[var(--mist)]/50 disabled:opacity-60"
              onClick={() => void pick(m.tenantId)}
            >
              <span className="block font-medium">{m.societyName}</span>
              <span className="text-sm text-[var(--leaf)]">
                {busy === m.tenantId ? "Switching…" : "Continue →"}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <p
            className="mt-4 text-center text-sm text-[var(--danger)]"
            data-testid="select-society-error"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
