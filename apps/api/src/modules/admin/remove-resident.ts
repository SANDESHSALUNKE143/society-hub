import { and, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { residentVehicles, residents, userRoles } from "../../db/schema";
import { AppError } from "../../lib/errors";

export async function removeResidentFromTenant(opts: {
  tenantId: string;
  actorUserId: string;
  userId: string;
}): Promise<{ ok: true }> {
  const [link] = await db
    .select()
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, opts.tenantId),
        eq(residents.userId, opts.userId),
        eq(residents.isDeleted, false),
      ),
    )
    .limit(1);
  if (!link) {
    throw new AppError(404, "resident_not_found", "Resident not found");
  }
  if (link.isOwner) {
    throw new AppError(
      409,
      "cannot_remove_owner",
      "The owner cannot be removed here. Edit them on the Owner tab.",
    );
  }

  await db
    .update(residents)
    .set({ isDeleted: true, updatedBy: opts.actorUserId })
    .where(eq(residents.id, link.id));
  await db
    .update(userRoles)
    .set({ isDeleted: true, updatedBy: opts.actorUserId })
    .where(
      and(
        eq(userRoles.tenantId, opts.tenantId),
        eq(userRoles.userId, opts.userId),
        eq(userRoles.role, "resident"),
        eq(userRoles.isDeleted, false),
      ),
    );
  await db
    .update(residentVehicles)
    .set({ isDeleted: true, updatedBy: opts.actorUserId })
    .where(
      and(
        eq(residentVehicles.tenantId, opts.tenantId),
        eq(residentVehicles.userId, opts.userId),
        eq(residentVehicles.isDeleted, false),
      ),
    );

  return { ok: true };
}
