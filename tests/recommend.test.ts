import { describe, expect, it } from "vitest";
import { scoreTask, DEFAULT_WEIGHTS } from "../src/lib/domain/recommend";
import type { Task, PriorityDef, StatusDef } from "../src/lib/types";

function task(overrides: Partial<Task>): Task {
  return {
    id: "t1",
    title: "Task",
    description: "",
    category: "",
    projectId: "",
    milestoneId: "",
    type: "",
    priority: "Medium",
    status: "Yet to Start",
    effort: 5,
    impact: 5,
    estimateMinutes: 60,
    dueDate: null,
    notes: "",
    progress: null,
    order: 0,
    createdAt: "",
    updatedAt: "",
    completedAt: "",
    archived: false,
    ...overrides,
  };
}

const medium: PriorityDef = { name: "Medium", rank: 3, weight: 0.5, color: "" };
const critical: PriorityDef = { name: "Critical", rank: 1, weight: 1, color: "" };
const todo: StatusDef = { name: "Yet to Start", group: "todo", color: "", order: 1 };
const blocked: StatusDef = { name: "Blocked", group: "waiting", color: "", order: 4 };
const inProgress: StatusDef = { name: "In Progress", group: "active", color: "", order: 2 };

const now = new Date(2026, 8, 15).getTime();

describe("scoreTask", () => {
  it("ranks a critical, high-impact, overdue task above a low-priority one", () => {
    const urgent = scoreTask(
      { task: task({ priority: "Critical", impact: 9, dueDate: "2026-09-01" }), priorityDef: critical, statusDef: todo, remainingMinutesToday: 480, now },
      DEFAULT_WEIGHTS
    );
    const mundane = scoreTask(
      { task: task({ priority: "Low", impact: 2 }), priorityDef: { name: "Low", rank: 4, weight: 0.25, color: "" }, statusDef: todo, remainingMinutesToday: 480, now },
      DEFAULT_WEIGHTS
    );
    expect(urgent.score).toBeGreaterThan(mundane.score);
    expect(urgent.overdue).toBe(true);
  });

  it("penalizes blocked tasks even if otherwise high priority", () => {
    const blockedScore = scoreTask(
      { task: task({ priority: "Critical" }), priorityDef: critical, statusDef: blocked, remainingMinutesToday: 480, now },
      DEFAULT_WEIGHTS
    );
    const activeScore = scoreTask(
      { task: task({ priority: "Critical" }), priorityDef: critical, statusDef: todo, remainingMinutesToday: 480, now },
      DEFAULT_WEIGHTS
    );
    expect(blockedScore.score).toBeLessThan(activeScore.score);
  });

  it("gives a momentum bonus to in-progress tasks over identical yet-to-start ones", () => {
    const active = scoreTask({ task: task({}), priorityDef: medium, statusDef: inProgress, remainingMinutesToday: 480, now }, DEFAULT_WEIGHTS);
    const fresh = scoreTask({ task: task({}), priorityDef: medium, statusDef: todo, remainingMinutesToday: 480, now }, DEFAULT_WEIGHTS);
    expect(active.score).toBeGreaterThan(fresh.score);
  });

  it("flags tasks longer than the remaining time today", () => {
    const result = scoreTask(
      { task: task({ estimateMinutes: 600 }), priorityDef: medium, statusDef: todo, remainingMinutesToday: 60, now },
      DEFAULT_WEIGHTS
    );
    expect(result.fitsRemaining).toBe(false);
  });
});
