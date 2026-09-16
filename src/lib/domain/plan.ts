import { hmToMinutes } from "../time";
import type { DailyPlanItem } from "../types";

export interface PlanSummary {
  availableMinutes: number;
  plannedMinutes: number;
  remainingMinutes: number;
  overAllocated: boolean;
  overByMinutes: number;
  /** Planned minutes grouped by parallel-group key ("" = its own solo group) or by detected time overlap. */
  groups: { key: string; minutes: number; itemIds: string[] }[];
}

function isTimed(item: DailyPlanItem): boolean {
  return Boolean(item.startTime && item.endTime);
}

/** Clusters transitively-overlapping [start,end) minute ranges; touching-but-not-overlapping ranges (12:00 end, 12:00 start) stay separate. */
function clusterOverlapping(items: { id: string; start: number; end: number }[]): { itemIds: string[]; minutes: number }[] {
  const sorted = [...items].sort((a, b) => a.start - b.start);
  const clusters: { itemIds: string[]; start: number; end: number }[] = [];
  for (const it of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && it.start < last.end) {
      last.itemIds.push(it.id);
      last.end = Math.max(last.end, it.end);
    } else {
      clusters.push({ itemIds: [it.id], start: it.start, end: it.end });
    }
  }
  return clusters.map((c) => ({ itemIds: c.itemIds, minutes: c.end - c.start }));
}

/**
 * Two ways an item can be concurrent with another (requirement #5 — e.g.
 * Task A 30m + Task B 30m in the same hour):
 *
 *  - **Scheduled overlap**: both have a start/end time and those clock
 *    ranges genuinely overlap. The day cost is the actual wall-clock union
 *    of the overlapping range(s) — 11:00-12:00 overlapping 11:30-12:30 costs
 *    90 minutes of the day, not 60 (max) and not 120 (sum).
 *  - **Manual `parallelGroup`**: for items with no fixed time, tagging two
 *    items with the same group label means "these run side by side"; the
 *    group's cost is its longest member, since there's no clock range to
 *    take a real union of.
 *
 * Items with neither are simply sequential and cost their own minutes in full.
 */
export function summarizePlan(items: DailyPlanItem[], availableMinutes: number): PlanSummary {
  const timed = items.filter(isTimed);
  const untimed = items.filter((i) => !isTimed(i));

  const timedClusters = clusterOverlapping(timed.map((i) => ({ id: i.id, start: hmToMinutes(i.startTime), end: hmToMinutes(i.endTime) })));
  const timedGroups = timedClusters.map((c) => ({ key: `time:${c.itemIds[0]}`, minutes: c.minutes, itemIds: c.itemIds }));

  const solo: { key: string; minutes: number; itemIds: string[] }[] = [];
  const byGroup = new Map<string, DailyPlanItem[]>();
  for (const item of untimed) {
    if (item.parallelGroup) {
      const arr = byGroup.get(item.parallelGroup) ?? [];
      arr.push(item);
      byGroup.set(item.parallelGroup, arr);
    } else {
      solo.push({ key: item.id, minutes: item.plannedMinutes, itemIds: [item.id] });
    }
  }
  const grouped = Array.from(byGroup.entries()).map(([key, groupItems]) => ({
    key,
    minutes: Math.max(...groupItems.map((i) => i.plannedMinutes), 0),
    itemIds: groupItems.map((i) => i.id),
  }));

  const groups = [...timedGroups, ...solo, ...grouped];
  const plannedMinutes = groups.reduce((sum, g) => sum + g.minutes, 0);
  const remainingMinutes = availableMinutes - plannedMinutes;

  return {
    availableMinutes,
    plannedMinutes,
    remainingMinutes,
    overAllocated: remainingMinutes < 0,
    overByMinutes: Math.max(0, -remainingMinutes),
    groups,
  };
}
