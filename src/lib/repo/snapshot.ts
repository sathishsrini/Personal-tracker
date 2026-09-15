import {
  rowToDailyPlanItem,
  rowToHistory,
  rowToLookup,
  rowToPriority,
  rowToStatus,
  rowToSubtask,
  rowToTask,
  rowToTimeEntry,
  rowToWeeklyPlanItem,
} from "../mappers";
import { getStorage } from "../storage";
import { DAY_MS, dateKey, toLocalIso } from "../time";
import type { Snapshot, StatusDef } from "../types";
import { logHistory } from "./history";
import { newId } from "./ids";
import { computeCarrySuggestions } from "./plans";
import { getSettings } from "./settings";
import { enforceConsistentEntries } from "./timer";

/** "Task / point" titles may carry a sub-bullet list; the first line is the title. */
export function parseBarePoint(title: string): { title: string; subtasks: string[] } {
  const lines = title
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length <= 1) return { title: lines[0] ?? title, subtasks: [] };
  const rest = lines.slice(1);
  if (rest.every((l) => l.startsWith("-"))) {
    return { title: lines[0], subtasks: rest.map((l) => l.replace(/^-\s*/, "")) };
  }
  return { title, subtasks: [] };
}

interface HydrationResult {
  claimed: number;
  subtasksAdded: number;
}

/**
 * Requirement #15 (#1 low-friction input): rows typed straight into the sheet
 * with only a title get an id, created/updated date and sensible defaults
 * filled back into the sheet. If the title carries a "- sub" list, the trailing
 * bullets become real subtask rows. Runs on every snapshot so edits made in
 * Sheets appear in the app without any setup.
 */
export async function hydrateBareTasks(): Promise<HydrationResult> {
  const storage = getStorage();
  const settings = await getSettings();
  const now = toLocalIso(Date.now());

  const claimed = await storage.claimBlankRows("Tasks", (row) => {
    if (!row.title?.trim()) return null;
    return {
      id: newId(),
      status: row.status || "Yet to Start",
      priority: row.priority || "Medium",
      category: row.category || settings.defaultCategory,
      type: row.type || settings.defaultType,
      archived: row.archived || "false",
      createdAt: row.createdAt || now,
      updatedAt: now,
    };
  });

  let subtasksAdded = 0;
  for (const row of claimed) {
    const { title, subtasks } = parseBarePoint(row.title ?? "");
    if (title !== row.title) {
      await storage.updateRow("Tasks", row.id, { title, updatedAt: now });
    }
    await logHistory({ taskId: row.id, type: "created", message: `Created "${title}"` });
    if (subtasks.length > 0) {
      for (const [i, st] of subtasks.entries()) {
        await storage.insertRow("Subtasks", {
          id: newId(),
          taskId: row.id,
          title: st,
          status: "Yet to Start",
          order: String(i),
          notes: "",
          createdAt: now,
          updatedAt: now,
        });
      }
      subtasksAdded += subtasks.length;
    }
  }
  return { claimed: claimed.length, subtasksAdded };
}

function buildWarnings(tasks: ReturnType<typeof rowToTask>[], entries: ReturnType<typeof rowToTimeEntry>[], storageError: string | null): string[] {
  const warnings: string[] = [];
  if (storageError) warnings.push(`Storage error: ${storageError}`);
  const byTask = new Map<string, ReturnType<typeof rowToTask>>();
  for (const t of tasks) byTask.set(t.id, t);
  for (const e of entries) {
    const isOpen = e.checkOut === null || e.checkOut === undefined;
    if (!isOpen) continue;
    const task = byTask.get(e.taskId);
    if (!task) {
      warnings.push("A running timer points at a missing task and will be closed automatically.");
      continue;
    }
    const estimateMinutes = task.estimateMinutes;
    const elapsedMin = Math.round((Date.now() - e.checkIn) / 60000);
    if (estimateMinutes !== null && elapsedMin > estimateMinutes) {
      warnings.push(`Timer for "${task.title}" has surpassed its ${estimateMinutes}m estimate (${elapsedMin}m).`);
    }
  }
  return warnings.slice(0, 5);
}

/** Full read model for the UI: every table mapped to domain objects, plus computed helpers. */
export async function buildSnapshot(): Promise<Snapshot> {
  const storage = getStorage();
  await storage.init();
  const settings = await getSettings();
  await enforceConsistentEntries(settings);
  await hydrateBareTasks();

  const all = await storage.readAll();
  const tasks = all.Tasks.map(rowToTask).filter((t) => t.id);
  const taskIds = new Set(tasks.map((t) => t.id));

  const statuses = all.Statuses.map(rowToStatus).filter((s) => s.name);
  const priorities = all.Priorities.map(rowToPriority).filter((p) => p.name);

  const today = dateKey();
  const carry = await computeCarrySuggestions(dateKey(Date.now() - DAY_MS), today, statuses);

  const info = storage.getInfo();
  return {
    serverNow: Date.now(),
    storage: info,
    settings,
    tasks,
    subtasks: all.Subtasks.map(rowToSubtask).filter((s) => s.id && taskIds.has(s.taskId)),
    entries: all.TimeEntries.map(rowToTimeEntry).filter((e) => e.id && !e.deleted),
    dailyPlan: all.DailyPlan.map(rowToDailyPlanItem).filter((p) => p.id && p.date === today),
    weeklyPlan: all.WeeklyPlan.map(rowToWeeklyPlanItem).filter((p) => p.id),
    history: all.TaskHistory.map(rowToHistory).filter((h) => h.id).slice(-200),
    categories: all.Categories.map(rowToLookup).filter((c) => c.name),
    priorities,
    statuses,
    tags: all.ActivityTags.map(rowToLookup).filter((t) => t.name),
    warnings: buildWarnings(tasks, all.TimeEntries.map(rowToTimeEntry), info.error),
    carry,
  };
}