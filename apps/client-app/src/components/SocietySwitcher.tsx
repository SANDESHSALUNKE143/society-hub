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
      .catch(() => undefined);
  }, [client, user?.tenantId]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const showSwitcher =
    memberships.length > 1 || user?.role === "superadmin";

  if (!showSwitcher) {
    if (!currentName && user?.flatNumber == null) return null;
    return (
      <div className="truncate rounded-lg bg-[var(--mist)]/60 px-3 py-2 text-sm font-medium text-[var(--leaf-dark)]">
        {currentName ?? "Your society"}
        {user?.flatNumber ? ` · Flat ${user.flatNumber}` : ""}
      </div>
    );
  }

  async function pick(tenantId: string) {
    if (tenantId === user?.tenantId) {
      setOpen(false);
      return;
    }
    try {
      const res = await client.selectTenant(tenantId);
      setSession(res.user, res.tokens);
    } catch {
      // API not ready yet — no-op.
    } finally {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        data-testid="society-switcher"
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--sand)] bg-white/70 px-3 py-2 text-left text-sm font-medium hover:border-[var(--leaf)]"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="truncate">{currentName ?? "Select society"}</span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0 text-black/45" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[14rem] rounded-lg border border-[var(--sand)] bg-white p-1 shadow-lg">
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
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
