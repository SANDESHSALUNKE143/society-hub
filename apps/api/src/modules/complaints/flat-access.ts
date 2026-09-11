import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../../db/client";
import { residents } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { isStaffRole } from "../../lib/auth-helpers";
import type { Role } from "@society-hub/types";

/** Active occupancy flat IDs for a user in this society (`active_key` set). */
export async function listActiveFlatIdsForUser(
  tenantId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .select({ flatId: residents.flatId })
    .from(residents)
    .where(
      and(
        eq(residents.tenantId, tenantId),
        eq(residents.userId, userId),
        eq(residents.isDeleted, false),
        isNotNull(residents.activeKey),
      ),
    );
  return [...new Set(rows.map((r) => r.flatId))];
}

/**
 * Staff may view any tenant complaint. Residents (and staff in household
 * mode) may view complaints for flats they currently occupy.
 */
export async function assertCanViewComplaint(input: {
  role: Role;
  tenantId: string;
  userId: string;
  complaintFlatId: string;
}): Promise<void> {
  if (isStaffRole(input.role)) return;
  const flatIds = await listActiveFlatIdsForUser(input.tenantId, input.userId);
  if (!flatIds.includes(input.complaintFlatId)) {
    throw new AppError(404, "not_found", "Complaint not found");
  }
}
