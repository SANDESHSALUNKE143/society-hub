import { describe, expect, test } from "bun:test";
import {
  DOCUMENT_TYPE_LABELS,
  INVITATION_STATUS_LABELS,
  OCCUPANCY_LABELS,
  RELATIONSHIP_LABELS,
  RESIDENT_STATUS_LABELS,
  RESIDENT_TYPE_LABELS,
  VERIFICATION_STATUS_LABELS,
  flatLabel,
  invitationBadgeClass,
  occupancyBadgeClass,
  occupancyPeriod,
  residentStatusBadgeClass,
  verificationBadgeClass,
} from "./resident-labels";

describe("labels", () => {
  test("every lifecycle state has human-readable copy", () => {
    expect(RESIDENT_TYPE_LABELS.owner).toBe("Owner");
    expect(RESIDENT_TYPE_LABELS.family).toBe("Family member");
    expect(RESIDENT_STATUS_LABELS.pending_verification).toBe("Pending verification");
    expect(RESIDENT_STATUS_LABELS.moved_out).toBe("Moved out");
    expect(VERIFICATION_STATUS_LABELS.under_review).toBe("Under review");
    expect(DOCUMENT_TYPE_LABELS.police_verification).toBe("Police verification");
    expect(RELATIONSHIP_LABELS.spouse).toBe("Spouse");
    expect(OCCUPANCY_LABELS.tenant_occupied).toBe("Tenant occupied");
    expect(INVITATION_STATUS_LABELS.expired).toBe("Expired");
  });

  test("no label is left blank", () => {
    const all = [
      RESIDENT_TYPE_LABELS,
      RESIDENT_STATUS_LABELS,
      VERIFICATION_STATUS_LABELS,
      DOCUMENT_TYPE_LABELS,
      RELATIONSHIP_LABELS,
      OCCUPANCY_LABELS,
      INVITATION_STATUS_LABELS,
    ];
    for (const map of all) {
      for (const value of Object.values(map)) {
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("badge classes", () => {
  test("resident status maps active to success and trouble to danger", () => {
    expect(residentStatusBadgeClass("active")).toBe("badge badge-success");
    expect(residentStatusBadgeClass("rejected")).toBe("badge badge-danger");
    expect(residentStatusBadgeClass("suspended")).toBe("badge badge-danger");
    expect(residentStatusBadgeClass("pending_verification")).toBe("badge");
    expect(residentStatusBadgeClass("moved_out")).toBe("badge");
  });

  test("verification status", () => {
    expect(verificationBadgeClass("approved")).toBe("badge badge-success");
    expect(verificationBadgeClass("rejected")).toBe("badge badge-danger");
    expect(verificationBadgeClass("pending")).toBe("badge");
    expect(verificationBadgeClass("under_review")).toBe("badge");
  });

  test("invitation status", () => {
    expect(invitationBadgeClass("accepted")).toBe("badge badge-success");
    expect(invitationBadgeClass("revoked")).toBe("badge badge-danger");
    expect(invitationBadgeClass("expired")).toBe("badge badge-danger");
    expect(invitationBadgeClass("pending")).toBe("badge");
  });

  test("occupancy status", () => {
    expect(occupancyBadgeClass("vacant")).toBe("badge");
    expect(occupancyBadgeClass("owner_occupied")).toBe("badge badge-success");
    expect(occupancyBadgeClass("tenant_occupied")).toBe("badge badge-danger");
  });
});

describe("flatLabel", () => {
  test("prefixes the wing when there is one", () => {
    expect(flatLabel({ number: "1204", wingName: "A" })).toBe("A-1204");
  });

  test("falls back to the bare number", () => {
    expect(flatLabel({ number: "101" })).toBe("101");
    expect(flatLabel({ number: "101", wingName: null })).toBe("101");
  });

  test("renders an em dash when there is no flat", () => {
    expect(flatLabel(null)).toBe("—");
    expect(flatLabel(undefined)).toBe("—");
  });
});

describe("occupancyPeriod", () => {
  test("an open period reads as Present", () => {
    expect(occupancyPeriod("2025-06-15 00:00:00.000", null)).toBe(
      "2025-06-15 → Present",
    );
  });

  test("a closed period shows both dates", () => {
    expect(
      occupancyPeriod("2023-01-01 00:00:00.000", "2025-05-31 00:00:00.000"),
    ).toBe("2023-01-01 → 2025-05-31");
  });

  test("an unknown move-in date is not invented", () => {
    expect(occupancyPeriod(null, null)).toBe("— → Present");
  });
});
