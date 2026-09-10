import { describe, expect, test } from "bun:test";
import { resolveIsOwnerForFlat } from "./flat-owner";

describe("resolveIsOwnerForFlat", () => {
  test("first person on an empty flat is the owner", () => {
    expect(
      resolveIsOwnerForFlat({
        requested: false,
        existingOwnerUserId: null,
        userId: "u-new",
      }),
    ).toBe(true);
    expect(
      resolveIsOwnerForFlat({
        requested: true,
        existingOwnerUserId: null,
        userId: "u-new",
      }),
    ).toBe(true);
  });

  test("later people are family even if requested as owner", () => {
    expect(
      resolveIsOwnerForFlat({
        requested: true,
        existingOwnerUserId: "u-owner",
        userId: "u-family",
      }),
    ).toBe(false);
  });

  test("the existing owner stays owner on re-onboard", () => {
    expect(
      resolveIsOwnerForFlat({
        requested: true,
        existingOwnerUserId: "u-owner",
        userId: "u-owner",
      }),
    ).toBe(true);
  });
});
