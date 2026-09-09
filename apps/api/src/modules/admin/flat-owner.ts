/** A flat has one owner. Everyone else on that flat is a family member. */

export function resolveIsOwnerForFlat(opts: {
  requested?: boolean;
  existingOwnerUserId: string | null;
  userId: string;
}): boolean {
  const existing = opts.existingOwnerUserId;
  if (!existing) return true;
  if (existing === opts.userId) return opts.requested !== false;
  return false;
}
