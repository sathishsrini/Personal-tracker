import { describe, expect, it } from "vitest";
import { summarizeTaskTime, openEntryForTask, remainingAgainstEstimate } from "../src/lib/domain/timer";
import type { TimeEntry } from "../src/lib/types";

function entry(overrides: Partial<TimeEntry>): TimeEntry {
  return {
    id: "e1",
    taskId: "t1",
    subtaskId: "",
    sessionId: "s1",
    tag: "Development",
    checkIn: 0,
    checkOut: 1000,
    durationSeconds: 1,
    endReason: "stop",
    source: "timer",
    date: "2026-09-15",
    note: "",
    opId: "",
    deleted: false,
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("summarizeTaskTime", () => {
  it("sums closed entries and adds live elapsed for an open one", () => {
    const now = 100_000;
    const entries = [
      entry({ id: "1", checkIn: 0, checkOut: 60_000, durationSeconds: 60 }),
      entry({ id: "2", checkIn: 90_000, checkOut: null, durationSeconds: 0, endReason: "" }),
    ];
    const summary = summarizeTaskTime(entries, "t1", now);
    expect(summary.isRunning).toBe(true);
    expect(summary.totalSeconds).toBe(60 + 10); // 60s closed + 10s live (100000-90000)/1000
  });

  it("ignores deleted entries and other tasks", () => {
    const entries = [
      entry({ id: "1", taskId: "other", durationSeconds: 500 }),
      entry({ id: "2", deleted: true, durationSeconds: 500 }),
      entry({ id: "3", durationSeconds: 42, checkOut: 42_000 }),
    ];
    const summary = summarizeTaskTime(entries, "t1", 50_000);
    expect(summary.totalSeconds).toBe(42);
  });

  it("buckets duration by tag", () => {
    const entries = [
      entry({ id: "1", tag: "Development", durationSeconds: 100 }),
      entry({ id: "2", tag: "Testing", durationSeconds: 50 }),
      entry({ id: "3", tag: "Development", durationSeconds: 25 }),
    ];
    const summary = summarizeTaskTime(entries, "t1", 999_999);
    expect(summary.byTag).toEqual({ Development: 125, Testing: 50 });
  });

  it("finds the single open entry for a task", () => {
    const entries = [entry({ id: "1", checkOut: 1000 }), entry({ id: "2", checkOut: null })];
    expect(openEntryForTask(entries, "t1")?.id).toBe("2");
  });
});

describe("remainingAgainstEstimate", () => {
  it("flags overrun once accumulated exceeds estimate", () => {
    expect(remainingAgainstEstimate(60, 30 * 60).remainingSeconds).toBe(30 * 60);
    const over = remainingAgainstEstimate(60, 70 * 60);
    expect(over.overrun).toBe(true);
    expect(over.remainingSeconds).toBe(-10 * 60);
  });

  it("returns nulls when there is no estimate", () => {
    expect(remainingAgainstEstimate(null, 100)).toEqual({ estimateSeconds: null, remainingSeconds: null, overrun: false });
  });
});
