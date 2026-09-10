import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { BuildingDto, FlatDto, SocietyDto, WingDto } from "@society-hub/types";
import { useAuth } from "../auth";
import { canUseAdminMode } from "../app-mode";
import { Icon } from "../components/icons";

function BuildingBlock({ building }: { building: BuildingDto }) {
  const { client } = useAuth();
  const [wings, setWings] = useState<WingDto[]>([]);
  const [flatsByWing, setFlatsByWing] = useState<Record<string, FlatDto[]>>({});
  const [open, setOpen] = useState(true);

  useEffect(() => {
    client
      .listWings(building.id)
      .then((rows) => {
        setWings(rows);
        rows.forEach((w) => {
          client
            .listFlatsForWing(w.id)
            .then((flats) => setFlatsByWing((m) => ({ ...m, [w.id]: flats })))
            .catch(() => setFlatsByWing((m) => ({ ...m, [w.id]: [] })));
        });
      })
      .catch(() => setWings([]));
  }, [building.id, client]);

  return (
    <div className="card p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between text-left"
        onClick={() => setOpen((o) => !o)}
        data-testid="structure-building-toggle"
      >
        <span className="text-sm font-semibold">{building.name}</span>
        <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {wings.length === 0 && (
            <p className="text-xs text-black/40">No wings yet.</p>
          )}
          {wings.map((w) => {
            const flats = flatsByWing[w.id] ?? [];
            const byFloor = new Map<number | "unset", FlatDto[]>();
            flats.forEach((f) => {
              const key = f.floor ?? "unset";
              const list = byFloor.get(key) ?? [];
              list.push(f);
              byFloor.set(key, list);
            });

            return (
              <div key={w.id} className="rounded-lg border border-[var(--sand)] p-3">
                <p className="text-sm font-medium">Wing {w.name}</p>
                {flats.length === 0 ? (
                  <p className="mt-2 text-xs text-black/40">No flats yet.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {[...byFloor.entries()].map(([floor, list]) => (
                      <div key={String(floor)}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
                          {floor === "unset" ? "No floor set" : `Floor ${floor}`}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {list.map((f) => (
                            <span key={f.id} className="badge">
                              {f.number}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StructurePage() {
  const { client, user } = useAuth();
  const [society, setSociety] = useState<SocietyDto | null>(null);
  const [buildings, setBuildings] = useState<BuildingDto[]>([]);
  const allowed = canUseAdminMode(user?.role);
  const tenantId = user?.tenantId;

  useEffect(() => {
    if (!allowed || !tenantId) return;
    client.getSociety(tenantId).then(setSociety).catch(() => undefined);
    client
      .listBuildings(tenantId)
      .then(setBuildings)
      .catch(() => setBuildings([]));
  }, [client, tenantId, allowed]);

  if (!allowed || !tenantId) return <Navigate to="/dashboard" replace />;

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-display text-xl sm:text-2xl">{society?.name ?? "Society structure"}</h1>
        <p className="mt-0.5 text-sm text-black/55">
          Read-only list of wings and flats. SocietyHub adds flats from Manage (wing,
          floor, flat number).
        </p>
      </div>

      <h2 className="mb-2 text-sm font-semibold">Buildings</h2>
      <div className="space-y-2">
        {buildings.map((b) => (
          <BuildingBlock key={b.id} building={b} />
        ))}
        {buildings.length === 0 && (
          <div className="empty-state" data-testid="structure-empty">
            No buildings added yet.
          </div>
        )}
      </div>
    </div>
  );
}
