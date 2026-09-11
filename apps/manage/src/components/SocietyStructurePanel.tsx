import { FormEvent, useCallback, useEffect, useState } from "react";
import type { SocietyDto } from "@society-hub/types";
import { ApiClientError } from "@society-hub/sdk";
import { useAuth } from "../auth";
import { ConfirmDialog } from "./ConfirmDialog";

function errMessage(err: unknown, fallback: string) {
  return err instanceof ApiClientError ? err.body.message : fallback;
}

type BuildingRow = {
  id: string;
  name: string;
  wingCount: number;
  flatCount: number;
};

type WingRow = {
  id: string;
  name: string;
  buildingId: string;
  flatCount: number;
};

function StepPill({
  n,
  label,
  done,
  active,
}: {
  n: number;
  label: string;
  done: boolean;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        active
          ? "border-[var(--leaf)] bg-[var(--mist)]"
          : done
            ? "border-[var(--sand)] bg-white text-black/70"
            : "border-dashed border-[var(--sand)] text-black/40"
      }`}
    >
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          done
            ? "bg-[var(--leaf)] text-white"
            : active
              ? "bg-[var(--leaf)]/15 text-[var(--leaf-dark)]"
              : "bg-black/5 text-black/40"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

export function SocietyStructurePanel({
  societyId,
  society,
  onSocietyUpdated,
  onGoToFlats,
}: {
  societyId: string;
  society: SocietyDto | null;
  onSocietyUpdated: () => void | Promise<void>;
  onGoToFlats: () => void;
}) {
  const { client } = useAuth();
  const [buildings, setBuildings] = useState<BuildingRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [wingsByBuilding, setWingsByBuilding] = useState<Record<string, WingRow[]>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [societyName, setSocietyName] = useState("");
  const [editingSociety, setEditingSociety] = useState(false);

  const [towerName, setTowerName] = useState("");
  const [renamingTowerId, setRenamingTowerId] = useState<string | null>(null);
  const [renameTowerValue, setRenameTowerValue] = useState("");

  const [wingDrafts, setWingDrafts] = useState<Record<string, string>>({});
  const [renamingWingId, setRenamingWingId] = useState<string | null>(null);
  const [renameWingValue, setRenameWingValue] = useState("");

  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "tower"; id: string; name: string }
    | { kind: "wing"; id: string; name: string; buildingId: string }
    | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (society) setSocietyName(society.name);
  }, [society]);

  const loadBuildings = useCallback(() => {
    return client
      .listManageSocietyBuildings(societyId)
      .then((rows) => {
        setBuildings(rows);
        if (rows.length > 0 && !expandedId) setExpandedId(rows[0]!.id);
      })
      .catch((err) => {
        setBuildings([]);
        setError(errMessage(err, "Failed to load towers"));
      });
  }, [client, societyId, expandedId]);

  const loadWings = useCallback(
    (buildingId: string) => {
      return client
        .listManageSocietyWings(societyId, buildingId)
        .then((rows) =>
          setWingsByBuilding((m) => ({ ...m, [buildingId]: rows })),
        )
        .catch(() =>
          setWingsByBuilding((m) => ({ ...m, [buildingId]: [] })),
        );
    },
    [client, societyId],
  );

  useEffect(() => {
    void loadBuildings();
  }, [loadBuildings]);

  useEffect(() => {
    if (!expandedId) return;
    void loadWings(expandedId);
  }, [expandedId, loadWings]);

  const towerCount = buildings?.length ?? 0;
  const wingCount =
    buildings?.reduce((n, b) => n + (wingsByBuilding[b.id]?.length ?? b.wingCount), 0) ??
    0;
  const flatCount = buildings?.reduce((n, b) => n + b.flatCount, 0) ?? 0;

  async function saveSocietyName(e: FormEvent) {
    e.preventDefault();
    const name = societyName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await client.updateSociety(societyId, {
        name,
        address: society?.address,
        city: society?.city,
        pincode: society?.pincode,
      });
      setEditingSociety(false);
      setMessage("Society name updated.");
      await onSocietyUpdated();
    } catch (err) {
      setError(errMessage(err, "Failed to rename society"));
    } finally {
      setBusy(false);
    }
  }

  async function addTower(e: FormEvent) {
    e.preventDefault();
    const name = towerName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const created = await client.addManageSocietyBuilding(societyId, { name });
      setTowerName("");
      setMessage(`Tower "${created.name}" added.`);
      setExpandedId(created.id);
      await loadBuildings();
    } catch (err) {
      setError(errMessage(err, "Failed to add tower"));
    } finally {
      setBusy(false);
    }
  }

  async function saveTowerRename(buildingId: string) {
    const name = renameTowerValue.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await client.renameManageSocietyBuilding(societyId, buildingId, { name });
      setRenamingTowerId(null);
      setMessage("Tower renamed.");
      await loadBuildings();
    } catch (err) {
      setError(errMessage(err, "Failed to rename tower"));
    } finally {
      setBusy(false);
    }
  }

  async function addWing(buildingId: string, e: FormEvent) {
    e.preventDefault();
    const name = (wingDrafts[buildingId] ?? "").trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await client.addManageSocietyWing(societyId, buildingId, { name });
      setWingDrafts((m) => ({ ...m, [buildingId]: "" }));
      setMessage(`Wing "${name}" added.`);
      await Promise.all([loadBuildings(), loadWings(buildingId)]);
    } catch (err) {
      setError(errMessage(err, "Failed to add wing"));
    } finally {
      setBusy(false);
    }
  }

  async function saveWingRename(wingId: string, buildingId: string) {
    const name = renameWingValue.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await client.renameManageSocietyWing(societyId, wingId, { name });
      setRenamingWingId(null);
      setMessage("Wing renamed.");
      await loadWings(buildingId);
    } catch (err) {
      setError(errMessage(err, "Failed to rename wing"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setDeleteError(null);
    try {
      if (pendingDelete.kind === "tower") {
        await client.deleteManageSocietyBuilding(societyId, pendingDelete.id);
        if (expandedId === pendingDelete.id) setExpandedId(null);
        setMessage(`Tower "${pendingDelete.name}" deleted.`);
        await loadBuildings();
      } else {
        await client.deleteManageSocietyWing(societyId, pendingDelete.id);
        setMessage(`Wing "${pendingDelete.name}" deleted.`);
        await Promise.all([
          loadBuildings(),
          loadWings(pendingDelete.buildingId),
        ]);
      }
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(errMessage(err, "Failed to delete"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col" data-testid="society-structure">
      <div className="mb-4 shrink-0">
        <h2 className="font-semibold">Structure setup</h2>
        <p className="mt-1 text-sm text-black/55">
          Build the society in order: Society → Towers → Wings → Flats. Rename or
          delete towers and wings here anytime.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" data-testid="structure-steps">
          <StepPill n={1} label="Society" done />
          <StepPill n={2} label="Towers" done={towerCount > 0} active={towerCount === 0} />
          <StepPill
            n={3}
            label="Wings"
            done={wingCount > 0}
            active={towerCount > 0 && wingCount === 0}
          />
          <StepPill
            n={4}
            label="Flats"
            done={flatCount > 0}
            active={wingCount > 0 && flatCount === 0}
          />
        </div>
      </div>

      {message && <p className="mb-2 shrink-0 text-sm text-[var(--leaf)]">{message}</p>}
      {error && (
        <p className="mb-2 shrink-0 text-sm text-[var(--danger)]" data-testid="structure-error">
          {error}
        </p>
      )}

      <div className="mb-4 rounded-lg border border-[var(--sand)] p-4" data-testid="structure-society">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-black/40">
              1 · Society
            </p>
            {!editingSociety ? (
              <p className="mt-1 text-lg font-semibold">{society?.name ?? "…"}</p>
            ) : (
              <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={saveSocietyName}>
                <div>
                  <label className="label" htmlFor="structure-society-name">
                    Society name
                  </label>
                  <input
                    id="structure-society-name"
                    className="input"
                    data-testid="structure-society-name"
                    value={societyName}
                    onChange={(e) => setSocietyName(e.target.value)}
                    required
                  />
                </div>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  Save
                </button>
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditingSociety(false);
                    setSocietyName(society?.name ?? "");
                  }}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
          {!editingSociety && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              data-testid="structure-society-rename"
              disabled={busy}
              onClick={() => setEditingSociety(true)}
            >
              Rename
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-[var(--sand)] p-4" data-testid="structure-towers">
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40">
          2 · Towers
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={addTower}>
          <div className="min-w-[12rem] flex-1">
            <label className="label" htmlFor="structure-tower-name">
              New tower name
            </label>
            <input
              id="structure-tower-name"
              className="input"
              data-testid="structure-tower-name"
              value={towerName}
              onChange={(e) => setTowerName(e.target.value)}
              placeholder="Tower A"
              required
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            data-testid="structure-tower-add"
            disabled={busy}
          >
            Add tower
          </button>
        </form>

        {buildings === null ? (
          <p className="mt-3 text-sm text-black/50">Loading towers…</p>
        ) : buildings.length === 0 ? (
          <p className="mt-3 text-sm text-black/50" data-testid="structure-towers-empty">
            No towers yet. Add Tower A, Tower B, …
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {buildings.map((b) => {
              const open = expandedId === b.id;
              const wings = wingsByBuilding[b.id];
              return (
                <li
                  key={b.id}
                  className="rounded-lg border border-[var(--sand)] bg-white"
                  data-testid={`structure-tower-${b.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2 p-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() => setExpandedId(open ? null : b.id)}
                      data-testid={`structure-tower-toggle-${b.id}`}
                    >
                      <span className="text-black/40">{open ? "▾" : "▸"}</span>
                      {renamingTowerId === b.id ? (
                        <input
                          className="input"
                          data-testid="structure-tower-rename-input"
                          value={renameTowerValue}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setRenameTowerValue(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <span className="font-medium">{b.name}</span>
                      )}
                      <span className="text-xs text-black/45">
                        {b.wingCount} wing{b.wingCount === 1 ? "" : "s"} · {b.flatCount}{" "}
                        flat{b.flatCount === 1 ? "" : "s"}
                      </span>
                    </button>
                    {renamingTowerId === b.id ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busy}
                          onClick={() => void saveTowerRename(b.id)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          onClick={() => setRenamingTowerId(null)}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`structure-tower-rename-${b.id}`}
                          disabled={busy}
                          onClick={() => {
                            setRenamingTowerId(b.id);
                            setRenameTowerValue(b.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          data-testid={`structure-tower-delete-${b.id}`}
                          disabled={busy}
                          onClick={() =>
                            setPendingDelete({ kind: "tower", id: b.id, name: b.name })
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>

                  {open && (
                    <div className="border-t border-[var(--sand)] p-3" data-testid="structure-wings">
                      <p className="text-xs font-semibold uppercase tracking-wide text-black/40">
                        3 · Wings in {b.name}
                      </p>
                      <form
                        className="mt-2 flex flex-wrap items-end gap-2"
                        onSubmit={(e) => void addWing(b.id, e)}
                      >
                        <div>
                          <label className="label" htmlFor={`wing-${b.id}`}>
                            New wing
                          </label>
                          <input
                            id={`wing-${b.id}`}
                            className="input"
                            data-testid="structure-wing-name"
                            value={wingDrafts[b.id] ?? ""}
                            onChange={(e) =>
                              setWingDrafts((m) => ({ ...m, [b.id]: e.target.value }))
                            }
                            placeholder="A"
                            required
                          />
                        </div>
                        <button
                          className="btn btn-primary btn-sm"
                          type="submit"
                          data-testid="structure-wing-add"
                          disabled={busy}
                        >
                          Add wing
                        </button>
                      </form>

                      {!wings ? (
                        <p className="mt-2 text-sm text-black/50">Loading wings…</p>
                      ) : wings.length === 0 ? (
                        <p className="mt-2 text-sm text-black/50">No wings in this tower yet.</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {wings.map((w) => (
                            <li
                              key={w.id}
                              className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--mist)] px-3 py-2"
                              data-testid={`structure-wing-${w.id}`}
                            >
                              {renamingWingId === w.id ? (
                                <input
                                  className="input"
                                  data-testid="structure-wing-rename-input"
                                  value={renameWingValue}
                                  onChange={(e) => setRenameWingValue(e.target.value)}
                                  autoFocus
                                />
                              ) : (
                                <span className="font-medium">Wing {w.name}</span>
                              )}
                              <span className="text-xs text-black/45">
                                {w.flatCount} flat{w.flatCount === 1 ? "" : "s"}
                              </span>
                              <span className="flex-1" />
                              {renamingWingId === w.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={busy}
                                    onClick={() => void saveWingRename(w.id, b.id)}
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    disabled={busy}
                                    onClick={() => setRenamingWingId(null)}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    data-testid={`structure-wing-rename-${w.id}`}
                                    disabled={busy}
                                    onClick={() => {
                                      setRenamingWingId(w.id);
                                      setRenameWingValue(w.name);
                                    }}
                                  >
                                    Rename
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    data-testid={`structure-wing-delete-${w.id}`}
                                    disabled={busy}
                                    onClick={() =>
                                      setPendingDelete({
                                        kind: "wing",
                                        id: w.id,
                                        name: w.name,
                                        buildingId: b.id,
                                      })
                                    }
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-[var(--sand)] p-4" data-testid="structure-flats-next">
        <p className="text-xs font-semibold uppercase tracking-wide text-black/40">
          4 · Flats
        </p>
        <p className="mt-1 text-sm text-black/55">
          After towers and wings exist, add or CSV-import flat numbers on the Flats
          tab (pick the tower first).
        </p>
        <button
          type="button"
          className="btn btn-primary mt-3"
          data-testid="structure-goto-flats"
          onClick={onGoToFlats}
        >
          Go to Flats
        </button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.kind === "tower" ? "Delete tower" : "Delete wing"}
        message={
          pendingDelete
            ? pendingDelete.kind === "tower"
              ? `Delete tower "${pendingDelete.name}"? Empty wings and unoccupied flats under it are removed. Occupied flats block delete.`
              : `Delete wing "${pendingDelete.name}"? Unoccupied flats in this wing are removed. Occupied flats block delete.`
            : ""
        }
        confirmLabel="Delete"
        busy={busy}
        error={deleteError}
        onCancel={() => {
          if (busy) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
        onConfirm={() => void confirmDelete()}
        testId="structure-delete-dialog"
      />
    </section>
  );
}
