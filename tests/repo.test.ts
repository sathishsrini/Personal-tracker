import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { existsSync, unlinkSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "tracker-repo-"));
const dbFile = path.join(dir, "db.json");
const store = globalThis as unknown as { __trackerStorage?: unknown };

beforeAll(() => {
  process.env.STORAGE_DRIVER = "local";
  process.env.TRACKER_LOCAL_DB = dbFile;
});

afterEach(() => {
  store.__trackerStorage = undefined;
  if (existsSync(dbFile)) unlinkSync(dbFile);
});

afterAll(() => {
  delete process.env.STORAGE_DRIVER;
  delete process.env.TRACKER_LOCAL_DB;
  rmSync(dir, { recursive: true, force: true });
});

describe("repo integration (local driver)", () => {
  it("hydrates bare sheet rows into full tasks + subtasks", async () => {
    store.__trackerStorage = undefined;
    const { hydrateBareTasks, buildSnapshot } = await import("../src/lib/repo");
    const { getStorage } = await import("../src/lib/storage");
    const storage = getStorage();
    await storage.init();
    await storage.insertRow("Tasks", { title: "Ship feature\n- write tests\n- write docs" });

    await hydrateBareTasks();
    const snap = await buildSnapshot();
    const task = snap.tasks.find((t) => t.title === "Ship feature");
    expect(task?.id).toBeTruthy();
    expect(task?.priority).toBe("Medium");
    const subs = snap.subtasks.filter((s) => s.taskId === task?.id);
    expect(subs.map((s) => s.title).sort()).toEqual(["write docs", "write tests"]);
  });

  it("timer start is idempotent — double click yields one open entry", async () => {
    store.__trackerStorage = undefined;
    const { timerAction, createTask, buildSnapshot } = await import("../src/lib/repo");
    const task = await createTask({ title: "Timer idempotency" });
    const first = await timerAction({ taskId: task.id, action: "start", opId: "op-1" });
    const second = await timerAction({ taskId: task.id, action: "start", opId: "op-1" });
    expect(first.ok).toBe(true);
    expect(second.alreadyApplied).toBe(true);

    const openFor = async (taskId: string) => {
      const snap = await buildSnapshot();
      return snap.entries.filter((e) => e.taskId === taskId && e.checkOut === null);
    };

    expect((await openFor(task.id)).length).toBe(1);

    // a second start with a NEW opId is still a no-op (one open entry per task)
    await timerAction({ taskId: task.id, action: "start", opId: "op-2" });
    expect((await openFor(task.id)).length).toBe(1);

    // pause → resume keeps a single open entry and the same session
    await timerAction({ taskId: task.id, action: "pause", opId: "op-3" });
    await timerAction({ taskId: task.id, action: "resume", opId: "op-4" });
    expect((await openFor(task.id)).length).toBe(1);
  });

  it("closes stale open entries beyond maxTimerHours", async () => {
    store.__trackerStorage = undefined;
    const { timerAction, createTask, buildSnapshot, enforceConsistentEntries, getSettings } = await import("../src/lib/repo");
    const { getStorage } = await import("../src/lib/storage");
    const task = await createTask({ title: "Stale timer" });
    await timerAction({ taskId: task.id, action: "start", opId: "st1" });

    // Age the open entry to 13 hours old, over the 12h cap.
    const storage = getStorage();
    const rows = await storage.readTable("TimeEntries");
    const open = rows.find((r) => r.taskId === task.id && !r.checkOut);
    expect(open).toBeTruthy();
    await storage.updateRow("TimeEntries", open!.id, { checkIn: new Date(Date.now() - 13 * 3600_000).toISOString() });

    await enforceConsistentEntries(await getSettings());
    const snap = await buildSnapshot();
    expect(snap.entries.filter((e) => e.taskId === task.id && e.checkOut === null).length).toBe(0);
    const closed = snap.entries.find((e) => e.taskId === task.id && e.checkOut !== null);
    expect(closed?.endReason).toBe("auto");
  });

  it("stop persists a closed entry with a duration", async () => {
    store.__trackerStorage = undefined;
    const { timerAction, createTask, buildSnapshot } = await import("../src/lib/repo");
    const task = await createTask({ title: "Stop test" });
    await timerAction({ taskId: task.id, action: "start", opId: "s1" });
    await new Promise((r) => setTimeout(r, 1100));
    await timerAction({ taskId: task.id, action: "stop", opId: "s2" });
    const snap = await buildSnapshot();
    const closed = snap.entries.find((e) => e.taskId === task.id && e.checkOut !== null);
    expect(closed?.endReason).toBe("stop");
    expect(closed?.durationSeconds).toBeGreaterThanOrEqual(1);
    expect(closed?.checkOut).toBeGreaterThanOrEqual(closed?.checkIn ?? 0);
  });

  it("rejects a manual entry that overlaps an existing one for the same task", async () => {
    store.__trackerStorage = undefined;
    const { createManualEntry, createTask } = await import("../src/lib/repo");
    const task = await createTask({ title: "Overlap test" });
    const day = new Date(2026, 8, 15).getTime();
    const hour = 3600_000;
    await createManualEntry({ taskId: task.id, checkIn: day, checkOut: day + hour, tag: "Development" });
    await expect(createManualEntry({ taskId: task.id, checkIn: day + 30 * 60_000, checkOut: day + 90 * 60_000 })).rejects.toThrow(/overlap/i);
    const other = await createTask({ title: "Concurrent task" });
    await expect(createManualEntry({ taskId: other.id, checkIn: day, checkOut: day + hour })).resolves.toBeTruthy();
  });

  it("status change to Completed stops a running timer and logs history", async () => {
    store.__trackerStorage = undefined;
    const { createTask, updateTask, timerAction, buildSnapshot } = await import("../src/lib/repo");
    const task = await createTask({ title: "Complete me" });
    await timerAction({ taskId: task.id, action: "start", opId: "c1" });
    const updated = await updateTask(task.id, { status: "Completed" });
    expect(updated.status).toBe("Completed");
    const snap = await buildSnapshot();
    expect(snap.entries.filter((e) => e.taskId === task.id && e.checkOut === null).length).toBe(0);
    const statusEvents = snap.history.filter((h) => h.taskId === task.id && h.type === "status");
    expect(statusEvents.length).toBe(1);
    expect(statusEvents[0].to).toBe("Completed");
  });

  it("produces carry suggestions for unfinished planned tasks", async () => {
    store.__trackerStorage = undefined;
    const { createTask, replaceDailyPlan, computeCarrySuggestions } = await import("../src/lib/repo");
    const { rowToStatus } = await import("../src/lib/mappers");
    const { getStorage } = await import("../src/lib/storage");
    const task = await createTask({ title: "Carry me" });
    await replaceDailyPlan("2026-09-14", [{ taskId: task.id, plannedMinutes: 60 }]);
    const statuses = (await getStorage().readTable("Statuses")).map(rowToStatus).filter((s) => s.name);
    const suggestions = await computeCarrySuggestions("2026-09-14", "2026-09-15", statuses);
    expect(suggestions).toEqual([
      expect.objectContaining({ sourceDate: "2026-09-14", taskId: task.id, plannedMinutes: 60, targetDate: "2026-09-15" }),
    ]);
  });

  it("links tasks to a project and milestone, and surfaces both in the snapshot", async () => {
    store.__trackerStorage = undefined;
    const { createProject, createMilestone, createTask, buildSnapshot } = await import("../src/lib/repo");
    const project = await createProject({ name: "Tracker v2", targetDate: "2026-12-01" });
    const milestone = await createMilestone({ projectId: project.id, title: "Beta" });
    const task = await createTask({ title: "Wire it up", projectId: project.id, milestoneId: milestone.id });

    const snap = await buildSnapshot();
    expect(snap.projects.find((p) => p.id === project.id)?.name).toBe("Tracker v2");
    expect(snap.milestones.find((m) => m.id === milestone.id)?.projectId).toBe(project.id);
    const linked = snap.tasks.find((t) => t.id === task.id);
    expect(linked?.projectId).toBe(project.id);
    expect(linked?.milestoneId).toBe(milestone.id);
  });

  it("deleting a project removes its milestones but keeps the tasks, unlinked", async () => {
    store.__trackerStorage = undefined;
    const { createProject, createMilestone, createTask, deleteProjectPermanently, buildSnapshot } = await import("../src/lib/repo");
    const project = await createProject({ name: "Doomed" });
    const milestone = await createMilestone({ projectId: project.id, title: "Never" });
    const task = await createTask({ title: "Survivor", projectId: project.id, milestoneId: milestone.id });

    await deleteProjectPermanently(project.id);

    const snap = await buildSnapshot();
    expect(snap.projects.find((p) => p.id === project.id)).toBeUndefined();
    expect(snap.milestones.find((m) => m.id === milestone.id)).toBeUndefined();
    const kept = snap.tasks.find((t) => t.id === task.id);
    expect(kept?.title).toBe("Survivor");
    expect(kept?.projectId).toBe("");
    expect(kept?.milestoneId).toBe("");
  });

  it("rejects a milestone that points at no project", async () => {
    store.__trackerStorage = undefined;
    const { createMilestone } = await import("../src/lib/repo");
    await expect(createMilestone({ projectId: "nope", title: "Orphan" })).rejects.toThrow(/not found/i);
    await expect(createMilestone({ projectId: "", title: "Orphan" })).rejects.toThrow(/must belong to a project/i);
  });
});