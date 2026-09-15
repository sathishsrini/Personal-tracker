import { describe, expect, it } from "vitest";
import {
  formatHMS,
  formatHM,
  parseDuration,
  dateKey,
  parseDateKey,
  addDays,
  diffDays,
  startOfWeekKey,
  serialToLocalMs,
  parseTimestamp,
} from "../src/lib/time";

describe("formatHMS", () => {
  it("pads to two digits and does not cap hours at 24", () => {
    expect(formatHMS(0)).toBe("00:00:00");
    expect(formatHMS(37)).toBe("00:00:37");
    expect(formatHMS(8077)).toBe("02:14:37");
    expect(formatHMS(100 * 3600 + 61)).toBe("100:01:01");
  });
});

describe("formatHM", () => {
  it("formats hours/minutes compactly", () => {
    expect(formatHM(0)).toBe("0m");
    expect(formatHM(45 * 60)).toBe("45m");
    expect(formatHM(4 * 3600 + 20 * 60)).toBe("4h 20m");
    expect(formatHM(3 * 3600)).toBe("3h");
  });
});

describe("parseDuration", () => {
  it("parses plain numbers as minutes", () => {
    expect(parseDuration(90)).toBe(90);
    expect(parseDuration("90")).toBe(90);
  });
  it("parses clock form", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("01:30:00")).toBe(90);
  });
  it("parses unit suffixes", () => {
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("45 min")).toBe(45);
    expect(parseDuration("2 hours")).toBe(120);
  });
  it("returns null for garbage", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration(null)).toBeNull();
  });
});

describe("date keys", () => {
  it("round-trips addDays/diffDays", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(diffDays("2026-01-30", "2026-02-02")).toBe(3);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("parseDateKey handles ISO, slash and dotted forms", () => {
    expect(parseDateKey("2026-09-15")).toBe("2026-09-15");
    expect(parseDateKey("15/09/2026")).toBe("2026-09-15");
    expect(parseDateKey("9/20/2026")).toBe("2026-09-20"); // unambiguous month-first
  });

  it("startOfWeekKey finds the configured week start", () => {
    // 2026-09-15 is a Tuesday
    expect(startOfWeekKey("2026-09-15", 1)).toBe("2026-09-14"); // Monday
    expect(startOfWeekKey("2026-09-15", 0)).toBe("2026-09-13"); // Sunday
  });
});

describe("sheets serial dates", () => {
  it("converts a known serial to the right calendar day", () => {
    // 2026-09-15 local midnight
    const ms = new Date(2026, 8, 15).getTime();
    const days = Math.round((ms - new Date(1899, 11, 30).getTime()) / 86400000);
    expect(dateKey(serialToLocalMs(days))).toBe("2026-09-15");
  });

  it("parseTimestamp distinguishes epoch ms from serial numbers", () => {
    const epoch = Date.now();
    expect(parseTimestamp(String(epoch))).toBe(epoch);
    expect(parseTimestamp(46000)).not.toBeNull();
  });
});
