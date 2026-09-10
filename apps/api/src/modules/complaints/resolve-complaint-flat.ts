import type { Role } from "@society-hub/types";
import { AppError } from "../../lib/errors";
import { isStaffRole } from "../../lib/auth-helpers";

/**
 * FR-CMP-1: residents (and staff in Resident mode on the client) raise against
 * the linked household flat only. Staff may pass any tenant `flatId`.
 */
export function resolveComplaintFlatId(input: {
  role: Role;
  linkedFlatId: string | null | undefined;
  requestedFlatId: string | null | undefined;
}): string {
  const linked = input.linkedFlatId || null;
  const requested = input.requestedFlatId || null;

  if (!isStaffRole(input.role)) {
    if (!linked) {
      throw new AppError(
        400,
        "no_flat",
        "User is not linked to a flat; cannot raise complaint",
      );
    }
    if (requested && requested !== linked) {
      throw new AppError(
        403,
        "forbidden",
        "Cannot raise complaint for another flat",
      );
    }
    return linked;
  }

  const flatId = requested ?? linked;
  if (!flatId) {
    throw new AppError(400, "no_flat", "Select a flat to raise this complaint");
  }
  return flatId;
}
