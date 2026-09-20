import { describe, expect, it } from "vitest";
import { taskProgress, doneStatusNames } from "../src/lib/derive";
import type { Snapshot, StatusDef, Subtask, Task } from "../src/lib/types";

function task(overrides: Partial<Task> = {}): Task {
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

function sub(overrides: Partial<Subtask> = {}): Subtask {
  return {
    id: "s1",
    taskId: "t1",
    title: "Subtask",
    status: "Yet to Start",
    weight: null,
    estimateMinutes: null,
    order: 0,
    notes: "",
    createdAt: "",
    updatedAt: "",
    completedAt: "",
    ...overrides,
  };
}

const statuses: StatusDef[] = [
  { name: "Yet to Start", group: "todo", color: "", order: 1 },
  { name: "In Progress", group: "active", color: "", order: 2 },
  { name: "Completed", group: "done", color: "", order: 3 },
  { name: "Cancelled", group: "cancelled", color: "", order: 4 },
];

const snap = { statuses } as Snapshot;
const done = doneStatusNames(snap);

describe("taskProgress", () => {
  it("counts unrated subtasks equally, so behaviour is unchanged until weights are used", () => {
    const subs = [sub({ id: "a", status: "Completed" }), sub({ id: "b" }), sub({ id: "c" }), sub({ id: "d" })];
    expect(taskProgress(task(), subs, snap, done)).toMatchObject({ pct: 25, done: 1, total: 4, source: "subtasks" });
  });

  it("lets a heavy subtask move the bar further than a light one", () => {
    const subs = [sub({ id: "a", weight: 3, status: "Completed" }), sub({ id: "b", weight: 1 })];
    // 3 of 4 weight done — not the 50% a plain count would report.
    expect(taskProgress(task(), subs, snap, done).pct).toBe(75);

    const flipped = [sub({ id: "a", weight: 3 }), sub({ id: "b", weight: 1, status: "Completed" })];
    expect(taskProgress(task(), flipped, snap, done).pct).toBe(25);
  });

  it("keeps the done/total label as a plain count even when weights are set", () => {
    const subs = [sub({ id: "a", weight: 5, status: "Completed" }), sub({ id: "b", weight: 1 }), sub({ id: "c", weight: 1 })];
    const r = taskProgress(task(), subs, snap, done);
    expect(r.pct).toBe(71);
    expect(`${r.done}/${r.total}`).toBe("1/3");
  });

  it("mixes rated and unrated subtasks by treating unrated as weight 1", () => {
    const subs = [sub({ id: "a", weight: 3, status: "Completed" }), sub({ id: "b", weight: null })];
    expect(taskProgress(task(), subs, snap, done).pct).toBe(75);
  });

  it("treats a cancelled subtask as resolved rather than leaving the bar stuck", () => {
    const subs = [sub({ id: "a", status: "Completed" }), sub({ id: "b", status: "Cancelled" })];
    expect(taskProgress(task(), subs, snap, done).pct).toBe(100);
  });

  it("falls back to the Progress % column when there are no subtasks", () => {
    expect(taskProgress(task({ progress: 40 }), [], snap, done)).toMatchObject({ pct: 40, source: "field" });
  });

  it("clamps an out-of-range Progress % value", () => {
    expect(taskProgress(task({ progress: 250 }), [], snap, done).pct).toBe(100);
    expect(taskProgress(task({ progress: -10 }), [], snap, done).pct).toBe(0);
  });

  it("falls back to status when there are neither subtasks nor a progress value", () => {
    expect(taskProgress(task({ status: "Completed" }), [], snap, done)).toMatchObject({ pct: 100, source: "status" });
    expect(taskProgress(task({ status: "In Progress" }), [], snap, done).pct).toBe(0);
  });

  it("prefers subtasks over a stale Progress % value", () => {
    const subs = [sub({ id: "a", status: "Completed" }), sub({ id: "b" })];
    expect(taskProgress(task({ progress: 99 }), subs, snap, done)).toMatchObject({ pct: 50, source: "subtasks" });
  });

  it("does not divide by zero when every subtask is weighted 0", () => {
    const subs = [sub({ id: "a", weight: 0, status: "Completed" }), sub({ id: "b", weight: 0 })];
    expect(taskProgress(task(), subs, snap, done).pct).toBe(50);
  });

  it("ignores a negative weight rather than letting it cancel out real work", () => {
    const subs = [sub({ id: "a", weight: -5, status: "Completed" }), sub({ id: "b", weight: 1 })];
    expect(taskProgress(task(), subs, snap, done).pct).toBe(50);
  });
});
