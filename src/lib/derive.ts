import { summarizePlan } from "./domain/plan";
import { entrySeconds } from "./domain/timer";
import { scoreTask, DEFAULT_WEIGHTS } from "./domain/recommend";
import { dayRange, formatHM } from "./time";
import type { Snapshot, Task } from "./types";

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

export function utilPct(actualSeconds: number, plannedMinutes: number): number {
  if (plannedMinutes <= 0) return 0;
  return Math.min(100, Math.round((actualSeconds / 60 / plannedMinutes) * 100));
}

export function fmtMin(mins: number): string {
  return formatHM(mins * 60);
}