/**
 * Concurrency-safe time aggregation.
 *
 * A single task's own recorded duration is always the literal sum of its
 * entries — concurrency never touches that number. What concurrency affects
 * is *cross-task* wall-clock accounting: if Task A ran 09:00-09:30 and Task B
 * ran 09:00-09:30 too, they used 30 minutes of the day, not 60. `mergedBusyMs`
 * computes that union so dashboards/utilization never double-count an
 * overlapping half hour as two.
 */
export interface Interval {
  start: number;
  end: number;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((iv) => iv.end > iv.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

/** Total wall-clock milliseconds actually covered, with overlaps counted once. */
export function mergedBusyMs(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((sum, iv) => sum + (iv.end - iv.start), 0);
}

/** Sum of each interval's own length — the "sum of task durations" figure, which CAN exceed wall-clock time. */
export function totalDurationMs(intervals: Interval[]): number {
  return intervals.reduce((sum, iv) => sum + Math.max(0, iv.end - iv.start), 0);
}

/** Milliseconds of `intervals` that fall inside [rangeStart, rangeEnd). */
export function clampedBusyMs(intervals: Interval[], rangeStart: number, rangeEnd: number): number {
  const clipped = intervals
    .map((iv) => ({ start: Math.max(iv.start, rangeStart), end: Math.min(iv.end, rangeEnd) }))
    .filter((iv) => iv.end > iv.start);
  return mergedBusyMs(clipped);
}
