import type {
  CarrySuggestion,
  DailyPlanItem,
  Milestone,
  PlanItemLike,
  Project,
  Settings,
  Snapshot,
  Subtask,
  Task,
  TimeEntry,
  TimerAction,
  TimerActionResult,
  WeeklyPlanItem,
} from "@/lib/types";
import { newId } from "@/lib/repo/ids";
import { dropOp, enqueueOp, queueSnapshot } from "./queue";

export interface IdBody {
  /** Client-generated idempotency key; safe to replay offline. */
  opId?: string;
}

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /fetch|network|load/i.test(err.message));
}

async function req<T>(route: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T> {
  const res = await fetch(route, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return parse<T>(res);
}

// ---------------------------------------------------------------------------
// offline outbox replay
// ---------------------------------------------------------------------------

let flushInFlight = false;

export async function flushOfflineQueue(): Promise<number> {
  if (flushInFlight) return 0;
  flushInFlight = true;
  try {
    const ops = queueSnapshot().slice().sort((a, b) => a.seq - b.seq);
    let done = 0;
    for (const op of ops) {
      try {
        await fetch(op.route, {
          method: op.method,
          headers: op.body === undefined ? undefined : { "Content-Type": "application/json" },
          body: op.body === undefined ? undefined : JSON.stringify(op.body),
          cache: "no-store",
        });
        dropOp(op.id);
        done += 1;
      } catch {
        break; // still offline — leave the rest queued in order
      }
    }
    return done;
  } finally {
    flushInFlight = false;
  }
}

/** True when the request failed for a network reason and was parked in the outbox. */
function tryQueueOnNetworkError(err: unknown, producer: () => { opId: string; route: string; method: "POST" | "PATCH" | "DELETE"; body: unknown }): boolean {
  if (!isNetworkError(err)) return false;
  const op = producer();
  enqueueOp({ id: op.opId, route: op.route, method: op.method, body: op.body });
  return true;
}

/**
 * Wraps an idempotent op: queue it when the network is down (replayed later
 * with its opId, so it can never duplicate), and opportunistically flush any
 * pending outbox ops once connectivity returns.
 */
async function reliable<T>(
  producer: () => { opId: string; route: string; method: "POST" | "PATCH" | "DELETE"; body: unknown },
  fn: () => Promise<T>
): Promise<T | { queued: true }> {
  try {
    const result = await fn();
    void flushOfflineQueue();
    return result;
  } catch (err) {
    if (tryQueueOnNetworkError(err, producer)) return { queued: true };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// snapshot + settings
// ---------------------------------------------------------------------------

export function fetchSnapshot(): Promise<Snapshot> {
  return req<Snapshot>("/api/snapshot", "GET");
}

export function manualSync(): Promise<Snapshot> {
  return req<Snapshot>("/api/sync", "POST", {});
}

export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  return req<Settings>("/api/settings", "PATCH", patch);
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

export interface NewTaskInput {
  title: string;
  description?: string;
  category?: string;
  projectId?: string;
  milestoneId?: string;
  type?: string;
  priority?: string;
  status?: string;
  effort?: number | null;
  impact?: number | null;
  estimateMinutes?: number | null;
  dueDate?: string | null;
  notes?: string;
}

export function createTask(input: NewTaskInput): Promise<Task> {
  return req<Task>("/api/tasks", "POST", input);
}

export function updateTask(id: string, patch: Partial<NewTaskInput>): Promise<Task> {
  return req<Task>(`/api/tasks/${id}`, "PATCH", patch);
}

export function setTaskStatus(id: string, status: string): Promise<Task> {
  return req<Task>(`/api/tasks/${id}/status`, "POST", { status });
}

export function archiveTask(id: string): Promise<{ archived: boolean }> {
  return req(`/api/tasks/${id}`, "DELETE", { mode: "archive" });
}

export function restoreTask(id: string): Promise<{ archived: boolean }> {
  return req(`/api/tasks/${id}`, "DELETE", { restore: true });
}

export function deleteTaskPermanently(id: string): Promise<{ archived: boolean; permanent: boolean }> {
  return req(`/api/tasks/${id}`, "DELETE", { mode: "permanent" });
}

export interface ReorderUpdateInput {
  id: string;
  order: number;
  priority?: string;
}

export function reorderTasks(updates: ReorderUpdateInput[]): Promise<{ ok: boolean }> {
  return req("/api/tasks/reorder", "POST", { updates });
}

// ---------------------------------------------------------------------------
// projects + milestones
// ---------------------------------------------------------------------------

export interface NewProjectInput {
  name: string;
  description?: string;
  color?: string;
  status?: string;
  startDate?: string | null;
  targetDate?: string | null;
}

export function createProject(input: NewProjectInput): Promise<Project> {
  return req<Project>("/api/projects", "POST", input);
}

export function updateProject(id: string, patch: Partial<NewProjectInput> & { order?: number }): Promise<Project> {
  return req<Project>(`/api/projects/${id}`, "PATCH", patch);
}

export function archiveProject(id: string): Promise<{ archived: boolean }> {
  return req(`/api/projects/${id}`, "DELETE", { mode: "archive" });
}

export function restoreProject(id: string): Promise<{ archived: boolean }> {
  return req(`/api/projects/${id}`, "DELETE", { restore: true });
}

export function deleteProjectPermanently(id: string): Promise<{ archived: boolean; permanent: boolean }> {
  return req(`/api/projects/${id}`, "DELETE", { mode: "permanent" });
}

export interface NewMilestoneInput {
  title: string;
  description?: string;
  status?: string;
  dueDate?: string | null;
}

export function createMilestone(projectId: string, input: NewMilestoneInput): Promise<Milestone> {
  return req<Milestone>(`/api/projects/${projectId}/milestones`, "POST", input);
}

export function updateMilestone(id: string, patch: Partial<NewMilestoneInput> & { order?: number }): Promise<Milestone> {
  return req<Milestone>(`/api/milestones/${id}`, "PATCH", patch);
}

export function deleteMilestone(id: string): Promise<{ deleted: boolean }> {
  return req(`/api/milestones/${id}`, "DELETE", {});
}

// ---------------------------------------------------------------------------
// subtasks + notes
// ---------------------------------------------------------------------------

export function createSubtask(taskId: string, input: { title: string; weight?: number | null; estimateMinutes?: number | null }): Promise<Subtask> {
  return req<Subtask>(`/api/tasks/${taskId}/subtasks`, "POST", input);
}

export function updateSubtask(id: string, patch: { title?: string; status?: string; weight?: number | null; estimateMinutes?: number | null }): Promise<Subtask> {
  return req<Subtask>(`/api/subtasks/${id}`, "PATCH", patch);
}

export function deleteSubtask(id: string): Promise<{ deleted: boolean }> {
  return req(`/api/subtasks/${id}`, "DELETE", {});
}

export function addNote(taskId: string, kind: string, message: string): Promise<{ ok: boolean }> {
  return req(`/api/tasks/${taskId}/notes`, "POST", { kind, message });
}

// ---------------------------------------------------------------------------
// timer (idempotent + offline-queued)
// ---------------------------------------------------------------------------

export interface TimerOpInput extends IdBody {
  taskId: string;
  action: TimerAction;
  tag?: string;
  subtaskId?: string;
}

export type TimerOpResult = Partial<TimerActionResult> & { queued?: boolean };

export function timerOp(input: TimerOpInput): Promise<TimerOpResult> {
  const opId = input.opId ?? newId();
  const route = `/api/tasks/${input.taskId}/timer`;
  const method = "POST" as const;
  const body = { action: input.action, opId, tag: input.tag, subtaskId: input.subtaskId };
  return reliable(
    () => ({ opId, route, method, body }),
    () => req<TimerActionResult>(route, method, body)
  );
}

// ---------------------------------------------------------------------------
// manual time entries
// ---------------------------------------------------------------------------

export interface ManualEntryInput {
  taskId: string;
  subtaskId?: string;
  tag?: string;
  checkIn: number | string;
  checkOut?: number | string | null;
  note?: string;
}

export function createManualEntry(input: ManualEntryInput): Promise<TimeEntry> {
  return req<TimeEntry>("/api/entries", "POST", input);
}

export function updateManualEntry(id: string, patch: { tag?: string; checkIn?: number | string; checkOut?: number | string | null; note?: string }): Promise<TimeEntry> {
  return req<TimeEntry>(`/api/entries/${id}`, "PATCH", patch);
}

export function deleteManualEntry(id: string): Promise<{ deleted: boolean }> {
  return req(`/api/entries/${id}`, "DELETE", {});
}

// ---------------------------------------------------------------------------
// plans
// ---------------------------------------------------------------------------

export type { PlanItemLike };

export function fetchDailyPlan(date: string): Promise<DailyPlanItem[]> {
  return req<DailyPlanItem[]>(`/api/plan/daily/${date}`, "GET");
}

export function saveDailyPlan(date: string, items: PlanItemLike[]): Promise<DailyPlanItem[]> {
  return req<DailyPlanItem[]>(`/api/plan/daily/${date}`, "POST", { items });
}

export function fetchWeeklyPlan(week: string): Promise<WeeklyPlanItem[]> {
  return req<WeeklyPlanItem[]>(`/api/plan/weekly/${week}`, "GET");
}

export function saveWeeklyPlan(week: string, items: PlanItemLike[]): Promise<WeeklyPlanItem[]> {
  return req<WeeklyPlanItem[]>(`/api/plan/weekly/${week}`, "POST", { items });
}

export function carryForward(suggestions: CarrySuggestion[]): Promise<DailyPlanItem[]> {
  return req<DailyPlanItem[]>("/api/plan/carry", "POST", { suggestions });
}

// ---------------------------------------------------------------------------
// lookups (Categories / Priorities / Statuses / ActivityTags)
// ---------------------------------------------------------------------------

export type LookupTableName = "Categories" | "Priorities" | "Statuses" | "ActivityTags";

export function addLookupItem(table: LookupTableName, values: Record<string, string | number>): Promise<{ ok: boolean }> {
  return req(`/api/lookups/${table}`, "POST", values);
}

export function updateLookupItem(table: LookupTableName, name: string, patch: Record<string, string | number | boolean>): Promise<{ ok: boolean }> {
  return req(`/api/lookups/${table}/${encodeURIComponent(name)}`, "PATCH", patch);
}

export function deactivateLookupItem(table: LookupTableName, name: string): Promise<{ active: boolean }> {
  return req(`/api/lookups/${table}/${encodeURIComponent(name)}`, "DELETE", {});
}

export function reactivateLookupItem(table: LookupTableName, name: string): Promise<{ active: boolean }> {
  return req(`/api/lookups/${table}/${encodeURIComponent(name)}`, "DELETE", { restore: true });
}