import { parseClockTime, parseDateKey, parseDuration, parseTimestamp, toLocalIso } from "./time";
import type {
  DailyPlanItem,
  EndReason,
  HistoryItem,
  HistoryType,
  LookupItem,
  Milestone,
  PriorityDef,
  Project,
  Row,
  StatusDef,
  Subtask,
  Task,
  TimeEntry,
  WeeklyPlanItem,
} from "./types";

const truthy = (v: string | undefined): boolean => v === "true" || v === "TRUE" || v === "1";
const bool = (v: boolean): string => (v ? "true" : "false");

function toNumber(v: string | undefined): number | null {
  if (v === undefined || v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoOrEmpty(ms: number | null): string {
  return ms === null ? "" : toLocalIso(ms);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function rowToTask(row: Row): Task {
  return {
    id: row.id ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    category: row.category ?? "",
    projectId: row.projectId ?? "",
    milestoneId: row.milestoneId ?? "",
    type: row.type ?? "",
    priority: row.priority ?? "",
    status: row.status ?? "",
    effort: toNumber(row.effort),
    impact: toNumber(row.impact),
    estimateMinutes: row.estimateMinutes ? parseDuration(row.estimateMinutes) : null,
    dueDate: row.dueDate ? parseDateKey(row.dueDate) : null,
    notes: row.notes ?? "",
    progress: toNumber(row.progress),
    order: toNumber(row.order) ?? 0,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    completedAt: row.completedAt ?? "",
    archived: truthy(row.archived),
  };
}

export function taskToRow(task: Partial<Task>): Row {
  const row: Row = {};
  if (task.id !== undefined) row.id = task.id;
  if (task.title !== undefined) row.title = task.title;
  if (task.description !== undefined) row.description = task.description;
  if (task.category !== undefined) row.category = task.category;
  if (task.projectId !== undefined) row.projectId = task.projectId;
  if (task.milestoneId !== undefined) row.milestoneId = task.milestoneId;
  if (task.type !== undefined) row.type = task.type;
  if (task.priority !== undefined) row.priority = task.priority;
  if (task.status !== undefined) row.status = task.status;
  if (task.effort !== undefined) row.effort = task.effort === null ? "" : String(task.effort);
  if (task.impact !== undefined) row.impact = task.impact === null ? "" : String(task.impact);
  if (task.estimateMinutes !== undefined) row.estimateMinutes = task.estimateMinutes === null ? "" : String(task.estimateMinutes);
  if (task.dueDate !== undefined) row.dueDate = task.dueDate ?? "";
  if (task.notes !== undefined) row.notes = task.notes;
  if (task.progress !== undefined) row.progress = task.progress === null ? "" : String(task.progress);
  if (task.order !== undefined) row.order = String(task.order);
  if (task.createdAt !== undefined) row.createdAt = task.createdAt;
  if (task.updatedAt !== undefined) row.updatedAt = task.updatedAt;
  if (task.completedAt !== undefined) row.completedAt = task.completedAt;
  if (task.archived !== undefined) row.archived = bool(task.archived);
  return row;
}

// ---------------------------------------------------------------------------
// Subtasks
// ---------------------------------------------------------------------------

export function rowToSubtask(row: Row): Subtask {
  return {
    id: row.id ?? "",
    taskId: row.taskId ?? "",
    title: row.title ?? "",
    status: row.status ?? "",
    estimateMinutes: row.estimateMinutes ? parseDuration(row.estimateMinutes) : null,
    order: toNumber(row.order) ?? 0,
    notes: row.notes ?? "",
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    completedAt: row.completedAt ?? "",
  };
}

export function subtaskToRow(s: Partial<Subtask>): Row {
  const row: Row = {};
  if (s.id !== undefined) row.id = s.id;
  if (s.taskId !== undefined) row.taskId = s.taskId;
  if (s.title !== undefined) row.title = s.title;
  if (s.status !== undefined) row.status = s.status;
  if (s.estimateMinutes !== undefined) row.estimateMinutes = s.estimateMinutes === null ? "" : String(s.estimateMinutes);
  if (s.order !== undefined) row.order = String(s.order);
  if (s.notes !== undefined) row.notes = s.notes;
  if (s.createdAt !== undefined) row.createdAt = s.createdAt;
  if (s.updatedAt !== undefined) row.updatedAt = s.updatedAt;
  if (s.completedAt !== undefined) row.completedAt = s.completedAt;
  return row;
}

// ---------------------------------------------------------------------------
// Projects + milestones
// ---------------------------------------------------------------------------

export function rowToProject(row: Row): Project {
  return {
    id: row.id ?? "",
    name: row.name ?? "",
    description: row.description ?? "",
    color: row.color ?? "",
    status: row.status ?? "",
    startDate: row.startDate ? parseDateKey(row.startDate) : null,
    targetDate: row.targetDate ? parseDateKey(row.targetDate) : null,
    order: toNumber(row.order) ?? 0,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    completedAt: row.completedAt ?? "",
    archived: truthy(row.archived),
  };
}

export function projectToRow(p: Partial<Project>): Row {
  const row: Row = {};
  if (p.id !== undefined) row.id = p.id;
  if (p.name !== undefined) row.name = p.name;
  if (p.description !== undefined) row.description = p.description;
  if (p.color !== undefined) row.color = p.color;
  if (p.status !== undefined) row.status = p.status;
  if (p.startDate !== undefined) row.startDate = p.startDate ?? "";
  if (p.targetDate !== undefined) row.targetDate = p.targetDate ?? "";
  if (p.order !== undefined) row.order = String(p.order);
  if (p.createdAt !== undefined) row.createdAt = p.createdAt;
  if (p.updatedAt !== undefined) row.updatedAt = p.updatedAt;
  if (p.completedAt !== undefined) row.completedAt = p.completedAt;
  if (p.archived !== undefined) row.archived = bool(p.archived);
  return row;
}

export function rowToMilestone(row: Row): Milestone {
  return {
    id: row.id ?? "",
    projectId: row.projectId ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    status: row.status ?? "",
    dueDate: row.dueDate ? parseDateKey(row.dueDate) : null,
    order: toNumber(row.order) ?? 0,
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
    completedAt: row.completedAt ?? "",
  };
}

export function milestoneToRow(m: Partial<Milestone>): Row {
  const row: Row = {};
  if (m.id !== undefined) row.id = m.id;
  if (m.projectId !== undefined) row.projectId = m.projectId;
  if (m.title !== undefined) row.title = m.title;
  if (m.description !== undefined) row.description = m.description;
  if (m.status !== undefined) row.status = m.status;
  if (m.dueDate !== undefined) row.dueDate = m.dueDate ?? "";
  if (m.order !== undefined) row.order = String(m.order);
  if (m.createdAt !== undefined) row.createdAt = m.createdAt;
  if (m.updatedAt !== undefined) row.updatedAt = m.updatedAt;
  if (m.completedAt !== undefined) row.completedAt = m.completedAt;
  return row;
}

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

export function rowToTimeEntry(row: Row): TimeEntry {
  const checkIn = parseTimestamp(row.checkIn) ?? 0;
  const checkOut = row.checkOut ? parseTimestamp(row.checkOut) : null;
  return {
    id: row.id ?? "",
    taskId: row.taskId ?? "",
    subtaskId: row.subtaskId ?? "",
    sessionId: row.sessionId ?? "",
    tag: row.tag ?? "",
    checkIn,
    checkOut,
    durationSeconds: toNumber(row.durationSeconds) ?? 0,
    endReason: (row.endReason ?? "") as EndReason,
    source: row.source === "manual" ? "manual" : "timer",
    date: row.date ? (parseDateKey(row.date) ?? row.date) : "",
    note: row.note ?? "",
    opId: row.opId ?? "",
    deleted: truthy(row.deleted),
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

export function timeEntryToRow(e: Partial<TimeEntry>): Row {
  const row: Row = {};
  if (e.id !== undefined) row.id = e.id;
  if (e.taskId !== undefined) row.taskId = e.taskId;
  if (e.subtaskId !== undefined) row.subtaskId = e.subtaskId;
  if (e.sessionId !== undefined) row.sessionId = e.sessionId;
  if (e.tag !== undefined) row.tag = e.tag;
  if (e.checkIn !== undefined) row.checkIn = isoOrEmpty(e.checkIn);
  if (e.checkOut !== undefined) row.checkOut = isoOrEmpty(e.checkOut);
  if (e.durationSeconds !== undefined) row.durationSeconds = String(e.durationSeconds);
  if (e.endReason !== undefined) row.endReason = e.endReason;
  if (e.source !== undefined) row.source = e.source;
  if (e.date !== undefined) row.date = e.date;
  if (e.note !== undefined) row.note = e.note;
  if (e.opId !== undefined) row.opId = e.opId;
  if (e.deleted !== undefined) row.deleted = bool(e.deleted);
  if (e.createdAt !== undefined) row.createdAt = e.createdAt;
  if (e.updatedAt !== undefined) row.updatedAt = e.updatedAt;
  return row;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export function rowToDailyPlanItem(row: Row): DailyPlanItem {
  return {
    id: row.id ?? "",
    date: row.date ? (parseDateKey(row.date) ?? row.date) : "",
    taskId: row.taskId ?? "",
    subtaskId: row.subtaskId ?? "",
    plannedMinutes: parseDuration(row.plannedMinutes) ?? 0,
    startTime: parseClockTime(row.startTime),
    endTime: parseClockTime(row.endTime),
    parallelGroup: row.parallelGroup ?? "",
    order: toNumber(row.order) ?? 0,
    carriedFrom: row.carriedFrom ?? "",
    notes: row.notes ?? "",
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

export function dailyPlanItemToRow(p: Partial<DailyPlanItem>): Row {
  const row: Row = {};
  if (p.id !== undefined) row.id = p.id;
  if (p.date !== undefined) row.date = p.date;
  if (p.taskId !== undefined) row.taskId = p.taskId;
  if (p.subtaskId !== undefined) row.subtaskId = p.subtaskId;
  if (p.plannedMinutes !== undefined) row.plannedMinutes = String(p.plannedMinutes);
  if (p.startTime !== undefined) row.startTime = p.startTime;
  if (p.endTime !== undefined) row.endTime = p.endTime;
  if (p.parallelGroup !== undefined) row.parallelGroup = p.parallelGroup;
  if (p.order !== undefined) row.order = String(p.order);
  if (p.carriedFrom !== undefined) row.carriedFrom = p.carriedFrom;
  if (p.notes !== undefined) row.notes = p.notes;
  if (p.createdAt !== undefined) row.createdAt = p.createdAt;
  if (p.updatedAt !== undefined) row.updatedAt = p.updatedAt;
  return row;
}

export function rowToWeeklyPlanItem(row: Row): WeeklyPlanItem {
  return {
    id: row.id ?? "",
    weekStart: row.weekStart ? (parseDateKey(row.weekStart) ?? row.weekStart) : "",
    taskId: row.taskId ?? "",
    plannedMinutes: parseDuration(row.plannedMinutes) ?? 0,
    order: toNumber(row.order) ?? 0,
    carriedFrom: row.carriedFrom ?? "",
    notes: row.notes ?? "",
    createdAt: row.createdAt ?? "",
    updatedAt: row.updatedAt ?? "",
  };
}

export function weeklyPlanItemToRow(p: Partial<WeeklyPlanItem>): Row {
  const row: Row = {};
  if (p.id !== undefined) row.id = p.id;
  if (p.weekStart !== undefined) row.weekStart = p.weekStart;
  if (p.taskId !== undefined) row.taskId = p.taskId;
  if (p.plannedMinutes !== undefined) row.plannedMinutes = String(p.plannedMinutes);
  if (p.order !== undefined) row.order = String(p.order);
  if (p.carriedFrom !== undefined) row.carriedFrom = p.carriedFrom;
  if (p.notes !== undefined) row.notes = p.notes;
  if (p.createdAt !== undefined) row.createdAt = p.createdAt;
  if (p.updatedAt !== undefined) row.updatedAt = p.updatedAt;
  return row;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export function rowToHistory(row: Row): HistoryItem {
  return {
    id: row.id ?? "",
    taskId: row.taskId ?? "",
    timestamp: row.timestamp ?? "",
    type: (row.type ?? "update") as HistoryType,
    kind: row.kind ?? "",
    field: row.field ?? "",
    from: row.from ?? "",
    to: row.to ?? "",
    message: row.message ?? "",
  };
}

export function historyToRow(h: HistoryItem): Row {
  return {
    id: h.id,
    taskId: h.taskId,
    timestamp: h.timestamp,
    type: h.type,
    kind: h.kind,
    field: h.field,
    from: h.from,
    to: h.to,
    message: h.message,
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function rowToLookup(row: Row): LookupItem {
  return { name: row.name ?? "", color: row.color ?? "", active: row.active === undefined || row.active === "" ? true : truthy(row.active), order: toNumber(row.order) ?? 0 };
}

export function rowToPriority(row: Row): PriorityDef {
  return { name: row.name ?? "", rank: toNumber(row.rank) ?? 99, weight: toNumber(row.weight) ?? 0.5, color: row.color ?? "" };
}

export function rowToStatus(row: Row): StatusDef {
  const group = (row.group ?? "todo").toLowerCase();
  const validGroups = ["todo", "active", "waiting", "done", "cancelled"];
  return {
    name: row.name ?? "",
    group: (validGroups.includes(group) ? group : "todo") as StatusDef["group"],
    color: row.color ?? "",
    order: toNumber(row.order) ?? 99,
  };
}
