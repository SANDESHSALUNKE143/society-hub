import { describe, expect, test } from "bun:test";
import {
  complaintFlatLabel,
  complaintQueueLine,
  complaintTypeIconName,
  formatComplaintRaised,
  formatComplaintWhen,
  timelineEventIcon,
  timelineEventTitle,
} from "./complaint-card";

describe("complaint-card", () => {
  test("formats date like the store cards", () => {
    expect(formatComplaintWhen("2025-05-20T10:15:00.000Z")).toMatch(
      /20 May 2025, \d{1,2}:\d{2} [AP]M/,
    );
    expect(formatComplaintWhen("not-a-date")).toBe("");
  });

  test("labels the flat and falls back unknown types to other", () => {
    expect(complaintFlatLabel("4B")).toBe("Flat 4B");
    expect(complaintFlatLabel("")).toBe("");
    expect(complaintTypeIconName("lift")).toBe("lift");
    expect(complaintTypeIconName("parking")).toBe("other");
  });

  test("shows queue copy only while the ticket is open", () => {
    expect(
      complaintQueueLine({ status: "open", queueHint: "About 2 tickets ahead" }),
    ).toBe("About 2 tickets ahead");
    expect(complaintQueueLine({ status: "open", queuePosition: 178 })).toBe(
      "Queue #178",
    );
    expect(
      complaintQueueLine({ status: "in_progress", queuePosition: 1 }),
    ).toBe("");
  });

  test("names the first timeline step Submitted", () => {
    expect(timelineEventTitle(null, "open", { open: "In queue" })).toBe(
      "Submitted",
    );
    expect(timelineEventTitle("open", "assigned", { assigned: "Acknowledged" })).toBe(
      "Acknowledged",
    );
    expect(timelineEventIcon("open")).toBe("send");
    expect(timelineEventIcon("assigned")).toBe("check");
    expect(timelineEventIcon("in_progress")).toBe("work");
    expect(timelineEventIcon("resolved")).toBe("done");
    const now = new Date();
    expect(formatComplaintRaised(now.toISOString())).toBe("today");
  });
});
