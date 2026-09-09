import { useEffect, useRef, useState } from "react";
import type { MembershipDto } from "@society-hub/types";
import { uniqueMembershipsBySociety } from "@society-hub/ui";
import { useAuth } from "../auth";
import { Icon } from "./icons";

export function SocietySwitcher() {
  const { user, client, setSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState<MembershipDto[]>([]);
  const [currentName, setCurrentName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client
      .listMemberships()
      .then((rows) => {
        const unique = uniqueMembershipsBySociety(rows);
        setMemberships(unique);
        const mine = unique.find((r) => r.tenantId === user?.tenantId);
        if (mine) setCurrentName(mine.societyName);
      })
      .catch(() => {
        // Endpoint may not exist yet; fall back silently.
      });
  }, [client, user?.tenantId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function pick(tenantId: string) {
    if (tenantId === user?.tenantId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await client.selectTenant(tenantId);
      setSession(res.user, res.tokens);
    } catch {
      // Not available yet on the API — keep dropdown open with a hint.
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const showSwitcher = memberships.length > 1 || user?.role === "superadmin";
  const label = currentName ?? "Your society";

  if (!showSwitcher) {
    return (
      <div className="truncate rounded-lg bg-[var(--mist)]/60 px-3 py-2 text-sm font-medium text-[var(--leaf-dark)]">
        {label}
      </div>
    );
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        data-testid="society-switcher"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--sand)] bg-white/70 px-3 py-2 text-left text-sm font-medium text-[var(--ink)] hover:border-[var(--leaf)]"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
      >
        <span className="truncate">{label}</span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-black/45" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[14rem] rounded-lg border border-[var(--sand)] bg-white p-1 shadow-lg">
          {memberships.length === 0 && (
            <p className="px-3 py-2 text-xs text-black/45">No other societies yet.</p>
          )}
          {memberships.map((m) => (
            <button
              key={m.tenantId}
              type="button"
              data-testid="society-switcher-option"
              className={[
                "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--mist)]/60",
                m.tenantId === user?.tenantId ? "font-semibold text-[var(--leaf-dark)]" : "",
              ].join(" ")}
              onClick={() => pick(m.tenantId)}
            >
              <span className="truncate">{m.societyName}</span>
              <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-black/40">
                {m.role}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
