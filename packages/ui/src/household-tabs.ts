export type HouseholdTabId =
  | "owner"
  | "family"
  | "parking"
  | "two_wheeler"
  | "four_wheeler"
  | "gas";

export const HOUSEHOLD_TABS: Array<{ id: HouseholdTabId; label: string }> = [
  { id: "owner", label: "Owner" },
  { id: "family", label: "Family" },
  { id: "parking", label: "Parking Details" },
  { id: "two_wheeler", label: "Two-wheelers" },
  { id: "four_wheeler", label: "Four-wheelers" },
  { id: "gas", label: "Gas" },
];

export function householdSubmitLabel(
  tab: HouseholdTabId,
  options?: { hasOwner?: boolean; isOwnerTabEdit?: boolean },
): string {
  if (tab === "family") return "Save household counts";
  if (tab === "parking") return "Save parking";
  if (tab === "gas") return "Save gas";
  if (tab === "two_wheeler" || tab === "four_wheeler") return "Save vehicles";
  if (tab === "owner" && options?.isOwnerTabEdit) {
    return options.hasOwner ? "Update owner" : "Save owner";
  }
  return "Save profile";
}
