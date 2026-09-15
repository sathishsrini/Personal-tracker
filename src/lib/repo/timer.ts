import { timeEntryToRow, rowToTimeEntry } from "../mappers";
import { getStorage } from "../storage";
import { dateKey, toLocalIso } from "../time";
import type { Row, Settings, TimeEntry, TimerAction, TimerActionResult } from "../types";
import { logHistory } from "./history";
import { newId } from "./ids";
import { getSettings } from "./settings";

export interface TimerActionInput {
  taskId: string;
  action: TimerAction;
  /** Client-generated id used to make the op idempotent across retries/offline replays. */
  opId?: string;
  tag?: string;
  subtaskId?: string;
}

async function readEntries(): Promise<TimeEntry[]> {
  const storage = getStorage();
  const rows = await storage.readTable("TimeEntries");
  return rows.map(rowToTimeEntry);
}

/** Snapshots the wall time, so every write in one op agrees on `now`. */
interface NowRef {
  ms: number;
  iso: string;
  dayKey: string;
}

function nowRef(): NowRef {
  const ms = Date.now();
  return { ms, iso: toLocalIso(ms), dayKey: dateKey(ms) };
}

function openOf(entries: TimeEntry[]): TimeEntry[] {
  return entries.filter((e) => !e.deleted && (e.checkOut === null || e.checkOut === undefined));
}

/** Marks an entry closed. Pure — the caller persists the patch. */
function closePatch(entry: TimeEntry, reason: TimeEntry["endReason"], now: NowRef): Row {
  const seconds = Math.max(0, Math.round((now.ms - entry.checkIn) / 1000));
  return timeEntryToRow({
    checkOut: now.ms,
    durationSeconds: seconds,
    endReason: reason,
    updatedAt: now.iso,
  });
}

/**
 * Data-integrity sweep run before every mutating timer op and on snapshot:
 *  - any entry still open past the configured cap is auto-closed ("auto") so
 *    a forgotten timer can never balloon into days of phantom time;
 *  - if a task somehow ends up with several open entries (only possible via an
 *    external tool fiddling with the sheet), all but the newest are closed so
 *    "one open entry per task" is guaranteed at read time too (requirement #6).
 */
export async function enforceConsistentEntries(settings: Settings, nowMs = Date.now()): Promise<number> {
  const storage = getStorage();
  const entries = await readEntries();
  const fixes: { id: string; patch: Row }[] = [];
  const maxAge = Math.max(1, settings.maxTimerHours) * 3_600_000;

  const openByTask = new Map<string, TimeEntry[]>();
  for (const e of (entries as TimeEntry[])) {
    if (!(e.checkOut === null || e.checkOut === undefined) || e.deleted) continue;
    if (nowMs - e.checkIn > maxAge) fixes.push({ id: e.id, patch: closePatch(e, "auto", nowRef()) });
    else {
      const arr = openByTask.get(e.taskId) ?? [];
      arr.push(e);
      openByTask.set(e.taskId, arr);
    }
  }
  for (const [, group] of openByTask) {
    if (group.length <= 1) continue;
    const keep = group.reduce((a, b) => (a.checkIn > b.checkIn ? a : b));
    for (const e of group) {
      if (e.id !== keep.id) fixes.push({ id: e.id, patch: closePatch(e, "auto", nowRef()) });
    }
  }

  for (const fix of fixes) await storage.updateRow("TimeEntries", fix.id, fix.patch);
  return fixes.length;
}

function latestClosed(entries: TimeEntry[], taskId: string): TimeEntry | undefined {
  const mine = entries.filter((e) => e.taskId === taskId && !e.deleted && e.checkOut !== null);
  return mine.reduce<TimeEntry | undefined>((best, e) => (best === undefined || e.checkIn > best.checkIn ? e : best), undefined);
}

async function applyAction(input: TimerActionInput, entries: TimeEntry[], settings: Settings): Promise<TimerActionResult> {
  const storage = getStorage();
  const now = nowRef();
  const mine = entries.filter((e) => e.taskId === input.taskId && !e.deleted);
  const mineOpen = mine.filter((e) => e.checkOut === null || e.checkOut === undefined);

  // Idempotent replay: if this opId was already applied, an entry carrying it exists.
  if (input.opId) {
    const applied = mine.some((e) => e.opId === input.opId);
    if (applied) return { ok: true, action: input.action, taskId: input.taskId, alreadyApplied: true };
  }

  const openEntries = entries.filter((e) => !e.deleted && (e.checkOut === null || e.checkOut === undefined));

  switch (input.action) {
    case "start": {
      if (mineOpen.length > 0) {
        return { ok: true, action: "start", taskId: input.taskId, message: "Already running" };
      }
      // "single" mode: starting pauses every other running task.
      if (settings.timerMode === "single") {
        for (const e of openEntries) {
          if (e.taskId === input.taskId) continue;
          await storage.updateRow("TimeEntries", e.id, closePatch(e, "pause", now));
        }
      }
      const entry: TimeEntry = {
        id: newId(),
        taskId: input.taskId,
        subtaskId: input.subtaskId ?? "",
        sessionId: newId(),
        tag: input.tag?.trim() || settings.defaultTag || "Other",
        checkIn: now.ms,
        checkOut: null,
        durationSeconds: 0,
        endReason: "",
        source: "timer",
        date: now.dayKey,
        note: "",
        opId: input.opId ?? "",
        deleted: false,
        createdAt: now.iso,
        updatedAt: now.iso,
      };
      await storage.insertRow("TimeEntries", timeEntryToRow(entry));
      await logHistory({ taskId: input.taskId, type: "timer", kind: "start", message: `Timer started (${entry.tag})` });
      return { ok: true, action: "start", taskId: input.taskId };
    }

    case "pause": {
      const open = mineOpen[0];
      if (!open) return { ok: true, action: "pause", taskId: input.taskId, message: "Not running" };
      await storage.updateRow("TimeEntries", open.id, closePatch(open, "pause", now));
      await logHistory({ taskId: input.taskId, type: "timer", kind: "pause", message: "Timer paused" });
      return { ok: true, action: "pause", taskId: input.taskId };
    }

    case "resume": {
      if (mineOpen.length > 0) {
        return { ok: true, action: "resume", taskId: input.taskId, message: "Already running" };
      }
      const sessionId = latestClosed(mine, input.taskId)?.sessionId || newId();
      const tag = latestClosed(mine, input.taskId)?.tag || settings.defaultTag || "Other";
      const entry: TimeEntry = {
        id: newId(),
        taskId: input.taskId,
        subtaskId: input.subtaskId ?? "",
        sessionId,
        tag: input.tag?.trim() || tag,
        checkIn: now.ms,
        checkOut: null,
        durationSeconds: 0,
        endReason: "",
        source: "timer",
        date: now.dayKey,
        note: "",
        opId: input.opId ?? "",
        deleted: false,
        createdAt: now.iso,
        updatedAt: now.iso,
      };
      await storage.insertRow("TimeEntries", timeEntryToRow(entry));
      await logHistory({ taskId: input.taskId, type: "timer", kind: "resume", message: `Timer resumed (${entry.tag})` });
      return { ok: true, action: "resume", taskId: input.taskId };
    }

    case "stop": {
      const open = mineOpen[0];
      if (!open) return { ok: true, action: "stop", taskId: input.taskId, message: "Not running" };
      await storage.updateRow("TimeEntries", open.id, closePatch(open, "stop", now));
      await logHistory({ taskId: input.taskId, type: "timer", kind: "stop", message: "Timer stopped" });
      return { ok: true, action: "stop", taskId: input.taskId };
    }

    case "switch": {
      if (!input.tag?.trim()) return { ok: false, action: "switch", taskId: input.taskId, message: "A tag is required to switch" };
      const sessionId = mineOpen[0]?.sessionId || latestClosed(mine, input.taskId)?.sessionId || newId();
      if (mineOpen[0]) {
        await storage.updateRow("TimeEntries", mineOpen[0].id, closePatch(mineOpen[0], "switch", now));
      }
      const entry: TimeEntry = {
        id: newId(),
        taskId: input.taskId,
        subtaskId: input.subtaskId ?? "",
        sessionId,
        tag: input.tag!.trim(),
        checkIn: now.ms,
        checkOut: null,
        durationSeconds: 0,
        endReason: "",
        source: "timer",
        date: now.dayKey,
        note: "",
        opId: input.opId ?? "",
        deleted: false,
        createdAt: now.iso,
        updatedAt: now.iso,
      };
      await storage.insertRow("TimeEntries", timeEntryToRow(entry));
      await logHistory({ taskId: input.taskId, type: "timer", kind: "switch", message: `Switched to ${entry.tag}` });
      return { ok: true, action: "switch", taskId: input.taskId };
    }

    default:
      return { ok: false, action: input.action, taskId: input.taskId, message: `Unknown action: ${String(input.action)}` };
  }
}

/**
 * Applies a timer action with three layers of robustness:
 *  1. opId idempotency — replaying the same click (double-click, offline
 *     queue, browser retry) never creates a second entry;
 *  2. one-open-entry-per-task enforced against a fresh read (start/pause/
 *     resume/stop are all no-ops when there is nothing to do);
 *  3. a consistency sweep before every op closes stale or duplicate-open
 *     entries, so corrupted state self-heals instead of accumulating.
 */
export async function timerAction(input: TimerActionInput): Promise<TimerActionResult> {
  const storage = getStorage();
  await storage.init();
  const s = await getSettings();
  await enforceConsistentEntries(s);
  const entries = await readEntries();
  return applyAction(input, entries, s);
}

/** Used by status transitions: finishing a task first stops its timer (requirement #6/#8). */
export async function stopTimer(input: { taskId: string; opId?: string }): Promise<TimerActionResult> {
  return timerAction({ taskId: input.taskId, action: "stop", opId: input.opId });
}