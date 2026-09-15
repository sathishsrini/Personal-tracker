import type { DailyPlanItem } from "../types";

export interface PlanSummary {
  availableMinutes: number;
  plannedMinutes: number;
  remainingMinutes: number;
  overAllocated: boolean;
  overByMinutes: number;
  /** Planned minutes grouped by parallel-group key ("" = its own solo group). */
  groups: { key: string; minutes: number; itemIds: string[] }[];
}

/**
 * Items that share a non-empty `parallelGroup` are worked concurrently (see
 * requirement #5 — e.g. Task A 30m + Task B 30m in the same hour). Each
 * group's cost toward the day is the **longest** allocation in that group,
 * not the sum, so two half-hour concurrent tasks cost one half hour of the
 * day, not a full hour. Items with no group (or a unique/empty one) are
 * simply sequential and cost their own minutes in full.
 */
export function summarizePlan(items: DailyPlanItem[], availableMinutes: number): PlanSummary {
  const solo: { key: string; minutes: number; itemIds: string[] }[] = [];
  const byGroup = new Map<string, DailyPlanItem[]>();

  for (const item of items) {
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

  const groups = [...solo, ...grouped];
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
