import { describe, expect, test } from "bun:test";
import {
  canDeleteComplaint,
  canResidentEditComplaint,
} from "./complaint-access";

describe("complaint-access", () => {
  test("raiser can edit until resolved or closed", () => {
    expect(
      canResidentEditComplaint({
        role: "resident",
        userId: "u1",
        raisedByUserId: "u1",
        status: "open",
      }),
    ).toBe(true);
    expect(
      canResidentEditComplaint({
        role: "resident",
        userId: "u1",
        raisedByUserId: "u1",
        status: "in_progress",
      }),
    ).toBe(true);
    expect(
      canResidentEditComplaint({
        role: "resident",
        userId: "u1",
        raisedByUserId: "u1",
        status: "resolved",
      }),
    ).toBe(false);
    expect(
      canResidentEditComplaint({
        role: "resident",
        userId: "u1",
        raisedByUserId: "u2",
        status: "open",
      }),
    ).toBe(false);
  });

  test("resident may delete only an open ticket they raised", () => {
    expect(
      canDeleteComplaint({
        role: "resident",
        userId: "u1",
        raisedByUserId: "u1",
        status: "open",
      }),
    ).toBe(true);
    expect(
      canDeleteComplaint({
        role: "resident",
        userId: "u1",
        raisedByUserId: "u1",
        status: "assigned",
      }),
    ).toBe(false);
    expect(
      canDeleteComplaint({
        role: "chairperson",
        userId: "staff",
        raisedByUserId: "u1",
        status: "in_progress",
      }),
    ).toBe(true);
  });
});
