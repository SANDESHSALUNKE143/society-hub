import { and, eq } from "drizzle-orm";
import type { CommunicationPreferences } from "@society-hub/types";
import { db } from "../../db/client";
import { residentProfiles } from "../../db/schema";
import {
  DEFAULT_COMMUNICATION_PREFERENCES,
  parseCommunicationPreferences,
} from "../residents/repository";

export type ProfilePatch = {
  emergencyContact?: string | null;
  emergencyContactName?: string | null;
  emergencyContactRelation?: string | null;
  emergencyContactPhone?: string | null;
  vehicleNumber?: string | null;
  communicationPreferences?: Partial<CommunicationPreferences>;
};

const TEXT_FIELDS = [
  "emergencyContact",
  "emergencyContactName",
  "emergencyContactRelation",
  "emergencyContactPhone",
  "vehicleNumber",
] as const;

/** @returns true when a row was inserted or fields changed */
export async function upsertProfile(
  tenantId: string,
  userId: string,
  patch: ProfilePatch,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(residentProfiles)
    .where(and(eq(residentProfiles.tenantId, tenantId), eq(residentProfiles.userId, userId)))
    .limit(1);

  if (!existing) {
    const prefs: CommunicationPreferences = {
      ...DEFAULT_COMMUNICATION_PREFERENCES,
      ...(patch.communicationPreferences ?? {}),
    };
    await db.insert(residentProfiles).values({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      emergencyContact: patch.emergencyContact ?? null,
      emergencyContactName: patch.emergencyContactName ?? null,
      emergencyContactRelation: patch.emergencyContactRelation ?? null,
      emergencyContactPhone: patch.emergencyContactPhone ?? null,
      vehicleNumber: patch.vehicleNumber ?? null,
      communicationPrefsJson: patch.communicationPreferences
        ? JSON.stringify(prefs)
        : null,
      createdBy: userId,
      updatedBy: userId,
    });
    return true;
  }

  const next: Record<string, string | null> = {};
  let changed = existing.isDeleted;
  for (const field of TEXT_FIELDS) {
    const incoming = patch[field];
    const value = incoming !== undefined ? incoming : (existing[field] ?? null);
    next[field] = value ?? null;
    if ((existing[field] ?? null) !== (value ?? null)) changed = true;
  }

  let prefsJson = existing.communicationPrefsJson;
  if (patch.communicationPreferences) {
    const merged: CommunicationPreferences = {
      ...parseCommunicationPreferences(existing.communicationPrefsJson),
      ...patch.communicationPreferences,
    };
    const serialized = JSON.stringify(merged);
    if (serialized !== existing.communicationPrefsJson) changed = true;
    prefsJson = serialized;
  }

  if (!changed) return false;

  await db
    .update(residentProfiles)
    .set({
      ...next,
      communicationPrefsJson: prefsJson,
      isDeleted: false,
      updatedBy: userId,
    })
    .where(eq(residentProfiles.id, existing.id));
  return true;
}
