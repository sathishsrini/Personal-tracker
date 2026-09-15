import type { TimeEntry } from "../types";

/**
 * Timer model (see requirement #6).
 *
 * A "session" is one Start..Stop arc, identified by `sessionId`. Pausing
 * closes the current entry (checkOut = now, endReason = "pause") and
 * resuming opens a new entry with the *same* sessionId — so a session can
 * be made of several entries, and "accumulated duration" is just the sum of
 * `durationSeconds` across them, live entries included.
 *
 * The only state that matters is what's in `entries` (Sheets-backed). The
 * client never trusts a client-side accumulator across a refresh — it always
 * re-derives from the open entry's `checkIn` plus the sum of closed entries.
 * This is what makes the timer survive navigation, refresh, and crashes.
 */

export function isOpen(entry: Pick<TimeEntry, "checkOut" | "deleted">): boolean {
  return !entry.deleted && (entry.checkOut === null || entry.checkOut === undefined);
}

export function liveEntries(entries: TimeEntry[]): TimeEntry[] {
  return entries.filter((e) => !e.deleted);
}

/** The single open entry for a task (there must never be more than one — enforced server-side). */
export function openEntryForTask(entries: TimeEntry[], taskId: string): TimeEntry | undefined {
  return liveEntries(entries).find((e) => e.taskId === taskId && isOpen(e));
}

export function openEntriesAll(entries: TimeEntry[]): TimeEntry[] {
  return liveEntries(entries).filter(isOpen);
}

export function entriesForTask(entries: TimeEntry[], taskId: string): TimeEntry[] {
  return liveEntries(entries).filter((e) => e.taskId === taskId);
}

export function entriesForSubtask(entries: TimeEntry[], subtaskId: string): TimeEntry[] {
  return liveEntries(entries).filter((e) => e.subtaskId === subtaskId);
}

/** Seconds an entry has accumulated as of `now` (live if still open). */
export function entrySeconds(entry: TimeEntry, now: number): number {
  if (isOpen(entry)) return Math.max(0, Math.floor((now - entry.checkIn) / 1000));
  return Math.max(0, entry.durationSeconds);
}

export interface TaskTimeSummary {
  taskId: string;
  totalSeconds: number;
  isRunning: boolean;
  openEntry: TimeEntry | null;
  byTag: Record<string, number>;
  lastCheckIn: number | null;
  lastCheckOut: number | null;
  sessionCount: number;
}

export function summarizeTaskTime(entries: TimeEntry[], taskId: string, now: number): TaskTimeSummary {
  const mine = entriesForTask(entries, taskId);
  let totalSeconds = 0;
  const byTag: Record<string, number> = {};
  let lastCheckIn: number | null = null;
  let lastCheckOut: number | null = null;
  const sessions = new Set<string>();
  let openEntry: TimeEntry | null = null;

  for (const e of mine) {
    const seconds = entrySeconds(e, now);
    totalSeconds += seconds;
    const tag = e.tag || "Other";
    byTag[tag] = (byTag[tag] ?? 0) + seconds;
    sessions.add(e.sessionId || e.id);
    if (lastCheckIn === null || e.checkIn > lastCheckIn) lastCheckIn = e.checkIn;
    if (e.checkOut !== null && (lastCheckOut === null || e.checkOut > lastCheckOut)) lastCheckOut = e.checkOut;
    if (isOpen(e)) openEntry = e;
  }

  return {
    taskId,
    totalSeconds,
    isRunning: openEntry !== null,
    openEntry,
    byTag,
    lastCheckIn,
    lastCheckOut,
    sessionCount: sessions.size,
  };
}

export interface RemainingEstimate {
  estimateSeconds: number | null;
  remainingSeconds: number | null;
  overrun: boolean;
}

export function remainingAgainstEstimate(estimateMinutes: number | null, totalSeconds: number): RemainingEstimate {
  if (estimateMinutes === null) return { estimateSeconds: null, remainingSeconds: null, overrun: false };
  const estimateSeconds = estimateMinutes * 60;
  const remainingSeconds = estimateSeconds - totalSeconds;
  return { estimateSeconds, remainingSeconds, overrun: remainingSeconds < 0 };
}
