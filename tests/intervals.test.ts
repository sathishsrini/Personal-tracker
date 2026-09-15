import { describe, expect, it } from "vitest";
import { mergeIntervals, mergedBusyMs, totalDurationMs, clampedBusyMs } from "../src/lib/domain/intervals";

describe("mergedBusyMs", () => {
  it("does not double-count two concurrent 30-minute tasks in the same hour", () => {
    const start = new Date(2026, 8, 15, 9, 0, 0).getTime();
    const half = 30 * 60 * 1000;
    const taskA = { start, end: start + half };
    const taskB = { start, end: start + half };
    expect(totalDurationMs([taskA, taskB])).toBe(half * 2); // per-task sum still counts both
    expect(mergedBusyMs([taskA, taskB])).toBe(half); // wall-clock usage is only 30 minutes
  });

  it("merges overlapping but staggered intervals", () => {
    const t0 = 1_000_000;
    const iv = [
      { start: t0, end: t0 + 1000 },
      { start: t0 + 500, end: t0 + 1500 },
      { start: t0 + 3000, end: t0 + 4000 },
    ];
    expect(mergeIntervals(iv)).toEqual([
      { start: t0, end: t0 + 1500 },
      { start: t0 + 3000, end: t0 + 4000 },
    ]);
    expect(mergedBusyMs(iv)).toBe(1500 + 1000);
  });

  it("clampedBusyMs clips to a range", () => {
    const t0 = 0;
    const iv = [{ start: t0 - 1000, end: t0 + 5000 }];
    expect(clampedBusyMs(iv, 0, 3000)).toBe(3000);
  });
});
