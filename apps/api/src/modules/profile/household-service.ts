import { and, eq } from "drizzle-orm";
import type { SocietyResidentDto, UserDto } from "@society-hub/types";
import { db } from "../../db/client";
import { residents } from "../../db/schema";
import { AppError } from "../../lib/errors";
import type { AccessClaims } from "@society-hub/auth";
import { listResidentsForTenant } from "../admin/list-residents";
import { onboardResidentIntoTenant } from "../admin/onboard-resident";
import { removeResidentFromTenant } from "../admin/remove-resident";
import { linkedFlatIdOrThrow } from "./household-helpers";

export async function requireLinkedFlat(claims: AccessClaims) {
  return linkedFlatIdOrThrow(claims.flatId);
}

export async function requireFlatOwner(claims: AccessClaims) {
  const flatId = await requireLinkedFlat(claims);
  const [link] = await db
    .select({ isOwner: residents.isOwner })
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, claims.tenantId),
        eq(residents.userId, claims.sub),
        eq(residents.flatId, flatId),
        eq(residents.isDeleted, false),
      ),
    )
    .limit(1);
  if (!link?.isOwner) {
    throw new AppError(
      403,
      "forbidden",
      "Only the flat owner can add family members",
    );
  }
  return flatId;
}

export function listHouseholdMembers(
  tenantId: string,
  flatId: string,
): Promise<SocietyResidentDto[]> {
  return listResidentsForTenant(tenantId, flatId);
}

export async function addHouseholdMember(opts: {
  claims: AccessClaims;
  name: string;
  phone: string;
  email?: string | null;
}): Promise<{ user: UserDto }> {
  const flatId = await requireFlatOwner(opts.claims);
  const result = await onboardResidentIntoTenant({
    tenantId: opts.claims.tenantId,
    actorUserId: opts.claims.sub,
    name: opts.name,
    phone: opts.phone,
    email: opts.email,
    flatId,
    isOwner: false,
  });
  return { user: result.user };
}

export async function updateHouseholdMember(opts: {
  claims: AccessClaims;
  userId: string;
  name: string;
  phone: string;
  email?: string | null;
}): Promise<{ user: UserDto }> {
  const flatId = await requireFlatOwner(opts.claims);
  if (opts.userId === opts.claims.sub) {
    throw new AppError(
      409,
      "cannot_edit_owner",
      "Change the owner from Onboard, not from family members.",
    );
  }
  const result = await onboardResidentIntoTenant({
    tenantId: opts.claims.tenantId,
    actorUserId: opts.claims.sub,
    name: opts.name,
    phone: opts.phone,
    email: opts.email,
    flatId,
    isOwner: false,
    editUserId: opts.userId,
  });
  return { user: result.user };
}

export async function removeHouseholdMember(opts: {
  claims: AccessClaims;
  userId: string;
}): Promise<{ ok: true }> {
  await requireFlatOwner(opts.claims);
  if (opts.userId === opts.claims.sub) {
    throw new AppError(
      409,
      "cannot_remove_owner",
      "The owner cannot be removed here.",
    );
  }
  return removeResidentFromTenant({
    tenantId: opts.claims.tenantId,
    actorUserId: opts.claims.sub,
    userId: opts.userId,
  });
}
