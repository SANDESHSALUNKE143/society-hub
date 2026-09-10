import type { MembershipDto, Role } from "@society-hub/types";

/** Prefer staff (chairperson first) so Admin | Resident can switch in-app. */
const ROLE_PREFERENCE: Role[] = [
  "superadmin",
  "chairperson",
  "admin",
  "secretary",
  "treasurer",
  "cashier",
  "committee",
  "resident",
  "tenant",
];

function roleRank(role: Role): number {
  const normalized = role === "admin" ? "chairperson" : role;
  const index = ROLE_PREFERENCE.indexOf(normalized);
  return index === -1 ? ROLE_PREFERENCE.length : index;
}

/** Choose-society lists one option per society, not one per role. */
export function uniqueMembershipsBySociety(
  rows: MembershipDto[],
): MembershipDto[] {
  const best = new Map<string, MembershipDto>();
  for (const row of rows) {
    const prev = best.get(row.tenantId);
    if (!prev || roleRank(row.role) < roleRank(prev.role)) {
      best.set(row.tenantId, row);
    }
  }
  return [...best.values()];
}
