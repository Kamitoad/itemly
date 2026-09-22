import { describe, expect, it } from "vitest";
import { formatHistoryGroupDate, groupHistoryEntries } from "../src/history.js";

describe("history date groups", () => {
  it("groups purchases by date and sorts dates and times newest first", () => {
    const entries = [
      { id: "older-day", purchasedDate: "2026-09-19", purchasedTime: "20:00", scannedAt: "2026-09-20T03:00:00Z" },
      { id: "morning", purchasedDate: "2026-09-20", purchasedTime: "08:15", scannedAt: "2026-09-20T16:00:00Z" },
      { id: "evening", purchasedDate: "2026-09-20", purchasedTime: "19:45", scannedAt: "2026-09-21T03:00:00Z" }
    ];

    const groups = groupHistoryEntries(entries);

    expect(groups.map((group) => group.key)).toEqual(["2026-09-20", "2026-09-19"]);
    expect(groups[0]?.entries.map((entry) => entry.id)).toEqual(["evening", "morning"]);
  });

  it("formats the current year like a German transaction timeline", () => {
    expect(formatHistoryGroupDate("2026-09-20", new Date("2026-09-21T12:00:00"))).toBe("Sonntag, 20. September");
    expect(formatHistoryGroupDate("2025-09-20", new Date("2026-09-21T12:00:00"))).toContain("2025");
  });
});
