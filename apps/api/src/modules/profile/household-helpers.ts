import { AppError } from "../../lib/errors";

/** Any linked person can view the household — staff with a flat included. */
export function linkedFlatIdOrThrow(flatId: string | null | undefined): string {
  if (!flatId) {
    throw new AppError(400, "flat_required", "No flat linked to this account");
  }
  return flatId;
}
