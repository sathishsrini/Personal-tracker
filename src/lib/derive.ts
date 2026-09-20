import { summarizePlan } from "./domain/plan";
import { entrySeconds } from "./domain/timer";
import { classifyQuadrant, QUADRANTS, type QuadrantId } from "./domain/quadrant";
import { scoreTask, DEFAULT_WEIGHTS } from "./domain/recommend";
import { addDays, dayRange, formatHM, startOfWeekKey, weekKeys } from "./time";
import type { Snapshot, Subtask, Task, TimeEntry } from "./types";

export type ReportRange = "today" | "week" | "all";

/** [start, end) instant range for a report scope. `all` is unbounded. */
export function rangeBounds(range: ReportRange, weekStartsOn: number, now: number): [number, number] {
  if (range === "today") return dayRange(todayKey());
  if (range === "week") {
    const start = startOfWeekKey(todayKey(), weekStartsOn);
    return [dayRange(start)[0], dayRange(addDays(start, 6))[1]];
  }
  return [0, now + 1];
}

export function rangeLabel(range: ReportRange): string {
  return range === "today" ? "Today" : range === "week" ? "This week" : "All time";
}

export function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function planForDate(snap: Snapshot, date: string) {
  return snap.dailyPlan.filter((p) => p.date === date).sort((a, b) => a.order - b.order);
}

/** Planned cost of a day (concurrent groups count once), from the domain's own rules. */
export function dayPlanSummary(snap: Snapshot, date: string) {
  return summarizePlan(planForDate(snap, date), snap.settings.workdayHours * 60);
}

export function secondsInDay(entries: Snapshot["entries"], date: string, now: number): number {
  const [start, end] = dayRange(date);
  return entries.reduce((sum, e) => (e.checkIn >= start && e.checkIn < end ? sum + entrySeconds(e, now) : sum), 0);
}

export function tagTotals(entries: Snapshot["entries"], date: string, now: number): { tag: string; seconds: number }[] {
  const [start, end] = dayRange(date);
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.checkIn < start || e.checkIn >= end) continue;
    const tag = e.tag || "Other";
    map.set(tag, (map.get(tag) ?? 0) + entrySeconds(e, now));
  }
  return Array.from(map.entries())
    .map(([tag, seconds]) => ({ tag, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

export function categoryTotals(snap: Snapshot, date: string, now: number): { category: string; seconds: number }[] {
  const taskById = new Map(snap.tasks.map((t) => [t.id, t]));
  const map = new Map<string, number>();
  const [start, end] = dayRange(date);
  for (const e of snap.entries) {
    if (e.checkIn < start || e.checkIn >= end) continue;
    const category = taskById.get(e.taskId)?.category || "General";
    map.set(category, (map.get(category) ?? 0) + entrySeconds(e, now));
  }
  return Array.from(map.entries())
    .map(([category, seconds]) => ({ category, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

export function taskById(snap: Snapshot): Map<string, Task> {
  return new Map(snap.tasks.map((t) => [t.id, t]));
}

const DONE_GROUPS = new Set(["done", "cancelled"]);
const ACTIONABLE_GROUPS = new Set(["todo", "active"]);

export function isActionable(t: Task, snap: Snapshot): boolean {
  if (t.archived) return false;
  const status = snap.statuses.find((s) => s.name === t.status);
  return ACTIONABLE_GROUPS.has(status?.group ?? "todo");
}

export function isDone(t: Task, snap: Snapshot): boolean {
  const status = snap.statuses.find((s) => s.name === t.status);
  return DONE_GROUPS.has(status?.group ?? "");
}

/** Status names that count as finished, hoisted once by callers that render a list. */
export function doneStatusNames(snap: Snapshot): Set<string> {
  return new Set(snap.statuses.filter((s) => DONE_GROUPS.has(s.group)).map((s) => s.name));
}

export interface TaskProgress {
  /** 0-100, rounded. */
  pct: number;
  /** Plain subtask counts, for the "3/5" label — unweighted on purpose, because that is what the label claims. */
  done: number;
  total: number;
  /** Where the number came from, so the UI can label a hand-entered value honestly. */
  source: "subtasks" | "field" | "status";
}

/** The weighted roll-up on its own, for callers that have subtasks but no Task in hand. */
export function subtaskProgress(subtasks: Subtask[], doneNames: Set<string>): TaskProgress {
  let weightDone = 0;
  let weightTotal = 0;
  let countDone = 0;
  for (const s of subtasks) {
    const w = s.weight === null || !Number.isFinite(s.weight) || s.weight < 0 ? 1 : s.weight;
    weightTotal += w;
    if (doneNames.has(s.status)) {
      weightDone += w;
      countDone += 1;
    }
  }
  // Every subtask weighted 0 would divide by zero; fall back to the plain count.
  const pct = weightTotal > 0 ? (weightDone / weightTotal) * 100 : subtasks.length > 0 ? (countDone / subtasks.length) * 100 : 0;
  return { pct: Math.round(pct), done: countDone, total: subtasks.length, source: "subtasks" };
}

/**
 * How far along a task is.
 *
 * Subtasks are the primary signal because they are the thing the user actually
 * ticks off. Each carries an optional `weight` — a subtask rated 3 moves the
 * bar three times as far as one rated 1 — so "wrote the migration" does not
 * count the same as "renamed a variable". An unrated subtask weighs 1, which
 * makes this identical to a plain count until someone starts rating them.
 *
 * With no subtasks it falls back to the `Progress %` column (which the sheet
 * has always had and nothing ever displayed), and finally to the status: done
 * is 100, anything else is 0.
 *
 * `doneNames` is passed in rather than derived so a list of tasks maps the
 * status table once instead of once per row.
 */
export function taskProgress(task: Task, subtasks: Subtask[], snap: Snapshot, doneNames?: Set<string>): TaskProgress {
  const done = doneNames ?? doneStatusNames(snap);

  if (subtasks.length > 0) return subtaskProgress(subtasks, done);

  if (task.progress !== null && Number.isFinite(task.progress)) {
    return { pct: Math.min(100, Math.max(0, Math.round(task.progress))), done: 0, total: 0, source: "field" };
  }

  return { pct: done.has(task.status) ? 100 : 0, done: 0, total: 0, source: "status" };
}

/** "What should I work on now?" — top-scoring actionable tasks. */
export function recommendNext(snap: Snapshot, now: number, limit = 4): { task: Task; score: number; reasons: string[]; fitsRemaining: boolean }[] {
  const remaining = Math.max(0, dayPlanSummary(snap, todayKey()).remainingMinutes);
  const out: { task: Task; score: number; reasons: string[]; fitsRemaining: boolean }[] = [];
  for (const t of snap.tasks) {
    if (!isActionable(t, snap)) continue;
    const priorityDef = snap.priorities.find((p) => p.name === t.priority);
    const statusDef = snap.statuses.find((s) => s.name === t.status);
    const r = scoreTask({ task: t, priorityDef, statusDef, remainingMinutesToday: remaining, now }, DEFAULT_WEIGHTS);
    out.push({ task: t, score: r.score, reasons: r.reasons, fitsRemaining: r.fitsRemaining });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function overdueTasks(snap: Snapshot, now: number): Task[] {
  const cutoff = todayKey();
  return snap.tasks
    .filter((t) => t.dueDate && t.dueDate < cutoff && isActionable(t, snap))
    .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1));
}

/** Estimates vs actual for tasks with an estimate that has real tracked time. */
export function overrunTasks(snap: Snapshot, now: number): { task: Task; estimateMinutes: number; actualSeconds: number; overrunSeconds: number }[] {
  const totals = new Map<string, number>();
  for (const e of snap.entries) totals.set(e.taskId, (totals.get(e.taskId) ?? 0) + entrySeconds(e, now));
  return snap.tasks
    .filter((t) => t.estimateMinutes !== null)
    .map((t) => {
      const estimateSeconds = t.estimateMinutes! * 60;
      const actualSeconds = totals.get(t.id) ?? 0;
      return { task: t, estimateMinutes: t.estimateMinutes!, actualSeconds, overrunSeconds: actualSeconds - estimateSeconds };
    })
    .filter((r) => r.overrunSeconds > 0)
    .sort((a, b) => b.overrunSeconds - a.overrunSeconds);
}

export function completionTrend(snap: Snapshot, days: number, now: number): { date: string; completed: number }[] {
  const out: { date: string; completed: number }[] = [];
  const p = (n: number) => String(n).padStart(2, "0");
  for (let i = 0; i < days; i++) {
    const d = new Date(now - (days - 1 - i) * 86_400_000);
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    const count = snap.history.filter((h) => h.type === "status" && h.to === "Completed" && h.timestamp.startsWith(key)).length;
    out.push({ date: key, completed: count });
  }
  return out;
}

/** Buckets tracked seconds within [start,end) by an arbitrary key (tag/category/priority). */
function totalsInRange(entries: TimeEntry[], start: number, end: number, now: number, keyOf: (e: TimeEntry) => string): { key: string; seconds: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.checkIn < start || e.checkIn >= end) continue;
    const key = keyOf(e) || "Other";
    map.set(key, (map.get(key) ?? 0) + entrySeconds(e, now));
  }
  return Array.from(map.entries())
    .map(([key, seconds]) => ({ key, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

export function tagTotalsInRange(entries: TimeEntry[], start: number, end: number, now: number): { key: string; seconds: number }[] {
  return totalsInRange(entries, start, end, now, (e) => e.tag);
}

export function categoryTotalsInRange(snap: Snapshot, start: number, end: number, now: number): { key: string; seconds: number }[] {
  const byId = taskById(snap);
  return totalsInRange(snap.entries, start, end, now, (e) => byId.get(e.taskId)?.category ?? "");
}

export function priorityTotalsInRange(snap: Snapshot, start: number, end: number, now: number): { key: string; seconds: number }[] {
  const byId = taskById(snap);
  return totalsInRange(snap.entries, start, end, now, (e) => byId.get(e.taskId)?.priority ?? "");
}

export function totalSecondsInRange(entries: TimeEntry[], start: number, end: number, now: number): number {
  return entries.reduce((sum, e) => (e.checkIn >= start && e.checkIn < end ? sum + entrySeconds(e, now) : sum), 0);
}

export interface QuadrantBucket {
  id: QuadrantId;
  tasks: Task[];
}

/** Every actionable, classified task grouped into its effort/impact quadrant. */
export function quadrantBuckets(snap: Snapshot): QuadrantBucket[] {
  const ids = Object.keys(QUADRANTS) as QuadrantId[];
  const buckets = new Map<QuadrantId, Task[]>(ids.map((id) => [id, []]));
  for (const t of snap.tasks) {
    if (t.archived || isDone(t, snap)) continue;
    const id = classifyQuadrant(t.effort, t.impact, snap.settings.quadrantThreshold);
    if (id) buckets.get(id)!.push(t);
  }
  return ids.map((id) => ({ id, tasks: buckets.get(id)! }));
}

export function unclassifiedTasks(snap: Snapshot): Task[] {
  return snap.tasks.filter((t) => !t.archived && !isDone(t, snap) && (t.effort === null || t.impact === null));
}

/** Current week's [start,end) date-key pair for weekly reports/planner nav. */
export function currentWeekStart(snap: Snapshot, now: number): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = new Date(now);
  const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return startOfWeekKey(key, snap.settings.weekStartsOn);
}

export function weekDates(weekStart: string): string[] {
  return weekKeys(weekStart);
}

/** Planned-vs-actual per task for a weekly plan, actual summed over the week's calendar range. */
export function weeklyPlanVsActual(
  snap: Snapshot,
  weekStart: string,
  now: number
): { taskId: string; task: Task | undefined; plannedMinutes: number; actualSeconds: number }[] {
  const [start, end] = [dayRange(weekStart)[0], dayRange(addDays(weekStart, 6))[1]];
  const byId = taskById(snap);
  return snap.weeklyPlan
    .filter((p) => p.weekStart === weekStart)
    .map((p) => ({
      taskId: p.taskId,
      task: byId.get(p.taskId),
      plannedMinutes: p.plannedMinutes,
      actualSeconds: totalSecondsInRange(snap.entries.filter((e) => e.taskId === p.taskId), start, end, now),
    }));
}

export function utilPct(actualSeconds: number, plannedMinutes: number): number {
  if (plannedMinutes <= 0) return 0;
  return Math.min(100, Math.round((actualSeconds / 60 / plannedMinutes) * 100));
}

export function fmtMin(mins: number): string {
  return formatHM(mins * 60);
}