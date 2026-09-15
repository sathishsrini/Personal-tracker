import { rowToSubtask, rowToTask, subtaskToRow, taskToRow } from "../mappers";
import { getStorage } from "../storage";
import { toLocalIso } from "../time";
import type { Subtask, Task } from "../types";
import { logHistory } from "./history";
import { newId } from "./ids";
import { stopTimer } from "./timer";

const DONE_LIKE = new Set(["done", "cancelled"]);

export interface CreateTaskInput {
  title: string;
  description?: string;
  category?: string;
  type?: string;
  priority?: string;
  status?: string;
  effort?: number | null;
  impact?: number | null;
  estimateMinutes?: number | null;
  dueDate?: string | null;
  notes?: string;
}

async function statusGroup(statusName: string): Promise<string | undefined> {
  const storage = getStorage();
  const statuses = await storage.readTable("Statuses");
  return statuses.find((s) => s.name === statusName)?.group;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  if (!input.title?.trim()) throw new Error("Task title is required");
  const storage = getStorage();
  const settings = await import("./settings").then((m) => m.getSettings());
  const now = toLocalIso(Date.now());

  const task: Task = {
    id: newId(),
    title: input.title.trim(),
    description: input.description ?? "",
    category: input.category ?? settings.defaultCategory,
    type: input.type ?? settings.defaultType,
    priority: input.priority ?? "Medium",
    status: input.status ?? "Yet to Start",
    effort: input.effort ?? null,
    impact: input.impact ?? null,
    estimateMinutes: input.estimateMinutes ?? null,
    dueDate: input.dueDate ?? null,
    notes: input.notes ?? "",
    progress: null,
    createdAt: now,
    updatedAt: now,
    completedAt: "",
    archived: false,
  };

  await storage.insertRow("Tasks", taskToRow(task));
  await logHistory({ taskId: task.id, type: "created", message: `Created "${task.title}"` });
  return task;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  priority?: string;
  status?: string;
  effort?: number | null;
  impact?: number | null;
  estimateMinutes?: number | null;
  dueDate?: string | null;
  notes?: string;
  progress?: number | null;
}

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  category: "Category",
  type: "Type",
  priority: "Priority",
  effort: "Effort",
  impact: "Impact",
  estimateMinutes: "Estimate",
  dueDate: "Due date",
  notes: "Notes",
  progress: "Progress",
};

/**
 * Merges `patch` into the task and writes only the changed columns. Status
 * transitions are validated and logged separately from other field edits so
 * the activity log reads naturally, and moving into a done/cancelled status
 * auto-stops any running timer for the task first — a completed task can
 * never be left silently accumulating time (requirement #8/#6).
 */
export async function updateTask(id: string, patch: UpdateTaskInput): Promise<Task> {
  const storage = getStorage();
  const rows = await storage.readTable("Tasks");
  const existingRow = rows.find((r) => r.id === id);
  if (!existingRow) throw new Error(`Task ${id} not found`);
  const before = rowToTask(existingRow);

  const changedKeys = (Object.keys(patch) as (keyof UpdateTaskInput)[]).filter(
    (k) => patch[k] !== undefined && String(patch[k] ?? "") !== String(before[k] ?? "")
  );
  if (changedKeys.length === 0) return before;

  const now = toLocalIso(Date.now());
  const next: Task = { ...before, ...patch, updatedAt: now } as Task;

  if (patch.status && patch.status !== before.status) {
    const group = await statusGroup(patch.status);
    if (group && DONE_LIKE.has(group)) {
      await stopTimer({ taskId: id, opId: newId() }).catch(() => undefined);
      if (!next.completedAt) next.completedAt = now;
    } else {
      next.completedAt = "";
    }
  }

  await storage.updateRow("Tasks", id, taskToRow(next));

  if (patch.status && patch.status !== before.status) {
    await logHistory({ taskId: id, type: "status", field: "status", from: before.status, to: patch.status });
  }
  for (const key of changedKeys) {
    if (key === "status") continue;
    await logHistory({
      taskId: id,
      type: "field",
      field: FIELD_LABELS[key] ?? key,
      from: String(before[key] ?? ""),
      to: String(patch[key] ?? ""),
    });
  }

  return next;
}

export async function archiveTask(id: string): Promise<void> {
  const storage = getStorage();
  await stopTimer({ taskId: id, opId: newId() }).catch(() => undefined);
  await storage.updateRow("Tasks", id, { archived: "true", updatedAt: toLocalIso(Date.now()) });
  await logHistory({ taskId: id, type: "update", kind: "archive", message: "Archived" });
}

export async function restoreTask(id: string): Promise<void> {
  const storage = getStorage();
  await storage.updateRow("Tasks", id, { archived: "false", updatedAt: toLocalIso(Date.now()) });
  await logHistory({ taskId: id, type: "update", kind: "restore", message: "Restored from archive" });
}

/** Permanently removes a task and everything under it. Irreversible — the UI should confirm before calling this. */
export async function deleteTaskPermanently(id: string): Promise<void> {
  const storage = getStorage();
  const [subtasks, entries, dailyPlan, weeklyPlan, history] = await Promise.all([
    storage.readTable("Subtasks"),
    storage.readTable("TimeEntries"),
    storage.readTable("DailyPlan"),
    storage.readTable("WeeklyPlan"),
    storage.readTable("TaskHistory"),
  ]);
  await Promise.all([
    ...subtasks.filter((s) => s.taskId === id).map((s) => storage.deleteRow("Subtasks", s.id)),
    ...entries.filter((e) => e.taskId === id).map((e) => storage.deleteRow("TimeEntries", e.id)),
    ...dailyPlan.filter((p) => p.taskId === id).map((p) => storage.deleteRow("DailyPlan", p.id)),
    ...weeklyPlan.filter((p) => p.taskId === id).map((p) => storage.deleteRow("WeeklyPlan", p.id)),
    ...history.filter((h) => h.taskId === id).map((h) => storage.deleteRow("TaskHistory", h.id)),
  ]);
  await storage.deleteRow("Tasks", id);
}

export interface AddNoteInput {
  taskId: string;
  kind: "progress" | "completed" | "remaining" | "blocker" | "clarification" | "decision" | "note";
  message: string;
}

export async function addNote(input: AddNoteInput): Promise<void> {
  if (!input.message?.trim()) throw new Error("Note text is required");
  await logHistory({ taskId: input.taskId, type: "update", kind: input.kind, message: input.message.trim() });
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export interface CreateSubtaskInput {
  taskId: string;
  title: string;
  estimateMinutes?: number | null;
  order?: number;
}

export async function createSubtask(input: CreateSubtaskInput): Promise<Subtask> {
  if (!input.title?.trim()) throw new Error("Subtask title is required");
  const storage = getStorage();
  const now = toLocalIso(Date.now());
  const existing = await storage.readTable("Subtasks");
  const order = input.order ?? existing.filter((s) => s.taskId === input.taskId).length;

  const subtask: Subtask = {
    id: newId(),
    taskId: input.taskId,
    title: input.title.trim(),
    status: "Yet to Start",
    estimateMinutes: input.estimateMinutes ?? null,
    order,
    notes: "",
    createdAt: now,
    updatedAt: now,
    completedAt: "",
  };
  await storage.insertRow("Subtasks", subtaskToRow(subtask));
  await logHistory({ taskId: input.taskId, type: "subtask", kind: "added", message: subtask.title });
  return subtask;
}

export interface UpdateSubtaskInput {
  title?: string;
  status?: string;
  estimateMinutes?: number | null;
  order?: number;
  notes?: string;
}

export async function updateSubtask(id: string, patch: UpdateSubtaskInput): Promise<Subtask> {
  const storage = getStorage();
  const rows = await storage.readTable("Subtasks");
  const existingRow = rows.find((r) => r.id === id);
  if (!existingRow) throw new Error(`Subtask ${id} not found`);
  const before = rowToSubtask(existingRow);
  const now = toLocalIso(Date.now());
  const next: Subtask = { ...before, ...patch, updatedAt: now };
  if (patch.status && patch.status !== before.status) {
    const group = await statusGroup(patch.status);
    next.completedAt = group && DONE_LIKE.has(group) ? (before.completedAt || now) : "";
  }
  await storage.updateRow("Subtasks", id, subtaskToRow(next));
  if (patch.status && patch.status !== before.status) {
    await logHistory({ taskId: before.taskId, type: "subtask", kind: "status", field: before.title, from: before.status, to: patch.status });
  }
  return next;
}

export async function deleteSubtask(id: string): Promise<void> {
  const storage = getStorage();
  const rows = await storage.readTable("Subtasks");
  const row = rows.find((r) => r.id === id);
  await storage.deleteRow("Subtasks", id);
  if (row) await logHistory({ taskId: row.taskId, type: "subtask", kind: "removed", message: row.title });
}
