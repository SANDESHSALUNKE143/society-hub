import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Role } from "@society-hub/types";

/** Society Client App Admin-mode roles (Fassport "Raise"). Mirrors apps/api SOCIETY_STAFF_ROLES. */
export const SOCIETY_STAFF_ROLES: Role[] = [
  "chairperson",
  "admin",
  "secretary",
  "treasurer",
  "cashier",
  "committee",
];

/** Manage portal platform employees — also get Client Admin by default. */
export const PLATFORM_ROLES: Role[] = ["superadmin"];

export function isPlatformRole(role: Role | null | undefined) {
  return !!role && (PLATFORM_ROLES as string[]).includes(role);
}

export type AppMode = "admin" | "resident";

export function canUseAdminMode(role: Role | null | undefined) {
  return (
    !!role &&
    ((SOCIETY_STAFF_ROLES as string[]).includes(role) ||
      (PLATFORM_ROLES as string[]).includes(role))
  );
}

/** Society-wide flat picker is Admin mode only (FR-CMP-1). */
export function canPickComplaintFlat(
  role: Role | null | undefined,
  mode: AppMode,
) {
  return canUseAdminMode(role) && mode === "admin";
}

const MODE_KEY = "sh_app_mode";

type AppModeState = {
  mode: AppMode;
  setMode: (mode: AppMode) => void;
};

const AppModeContext = createContext<AppModeState | null>(null);

export function AppModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AppMode>(() => {
    const stored = localStorage.getItem(MODE_KEY);
    return stored === "admin" || stored === "resident" ? stored : "admin";
  });

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  function setMode(next: AppMode) {
    setModeState(next);
  }

  return (
    <AppModeContext.Provider value={{ mode, setMode }}>
      {children}
    </AppModeContext.Provider>
  );
}

export function useAppMode() {
  const ctx = useContext(AppModeContext);
  if (!ctx) throw new Error("useAppMode outside AppModeProvider");
  return ctx;
}
