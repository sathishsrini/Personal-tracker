import { describe, expect, it } from "vitest";
import { summarizePlan } from "../src/lib/domain/plan";
import type { DailyPlanItem } from "../src/lib/types";

const base: Omit<DailyPlanItem, "id" | "plannedMinutes" | "parallelGroup"> = {
  date: "2026-09-15",
  taskId: "t1",
  subtaskId: "",
  order: 0,
  carriedFrom: "",
  notes: "",
  createdAt: "",
  updatedAt: "",
};

function item(id: string, minutes: number, group = ""): DailyPlanItem {
  return { ...base, id, plannedMinutes: minutes, parallelGroup: group, taskId: id };
}

describe("summarizePlan", () => {
  it("sums sequential tasks against an 8-hour day", () => {
    const s = summarizePlan([item("A", 60), item("B", 120)], 8 * 60);
    expect(s.plannedMinutes).toBe(180);
    expect(s.remainingMinutes).toBe(300);
    expect(s.overAllocated).toBe(false);
  });

  it("charges a concurrent group only its longest member (30m + 30m concurrent = 30m, not 60m)", () => {
    const s = summarizePlan([item("A", 30, "grp1"), item("B", 30, "grp1")], 8 * 60);
    expect(s.plannedMinutes).toBe(30);
    expect(s.remainingMinutes).toBe(8 * 60 - 30);
  });

  it("flags over-allocation with the right overage", () => {
    const s = summarizePlan([item("A", 5 * 60), item("B", 4 * 60)], 8 * 60);
    expect(s.overAllocated).toBe(true);
    expect(s.overByMinutes).toBe(60);
  });

  it("mixes solo and concurrent groups correctly", () => {
    const s = summarizePlan([item("A", 60), item("B", 30, "g"), item("C", 45, "g")], 8 * 60);
    // A (60) + max(B=30, C=45) = 105
    expect(s.plannedMinutes).toBe(105);
  });
});
