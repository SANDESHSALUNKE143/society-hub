import { describe, expect, test } from "bun:test";
import { HOUSEHOLD_TABS, householdSubmitLabel } from "./household-tabs";

describe("household tabs", () => {
  test("uses the same six tabs as Onboard resident", () => {
    expect(HOUSEHOLD_TABS.map((tab) => tab.id)).toEqual([
      "owner",
      "family",
      "parking",
      "two_wheeler",
      "four_wheeler",
      "gas",
    ]);
    expect(HOUSEHOLD_TABS[0]?.label).toBe("Owner");
  });

  test("labels the save button for the active tab", () => {
    expect(householdSubmitLabel("family")).toBe("Save household counts");
    expect(householdSubmitLabel("parking")).toBe("Save parking");
    expect(householdSubmitLabel("gas")).toBe("Save gas");
    expect(householdSubmitLabel("two_wheeler")).toBe("Save vehicles");
    expect(
      householdSubmitLabel("owner", { isOwnerTabEdit: true, hasOwner: true }),
    ).toBe("Update owner");
    expect(
      householdSubmitLabel("owner", { isOwnerTabEdit: true, hasOwner: false }),
    ).toBe("Save owner");
    expect(householdSubmitLabel("owner")).toBe("Save profile");
  });
});
