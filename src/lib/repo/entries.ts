import { rowToTimeEntry, timeEntryToRow } from "../mappers";
import { getStorage } from "../storage";
import { dateKey, toLocalIso } from "../time";
import type { Row, TimeEntry } from "../types";
import { logHistory } from "./history";
import { newId } from "./ids";

export interface CreateManualEntryInput {
  taskId: string;
  subtaskId?: string;
  tag?: string;
  checkIn: number;
  checkOut?: number | null;
  note?: string;
}

export interface UpdateManualEntryInput {
  subtaskId?: string;
  tag?: string;
  checkIn?: number;
  checkOut?: number | null;
  note?: string;
}

const OPEN_END = Number.MAX_SAFE_INTEGER;

function effectiveEnd(e: Pick<TimeEntry, "checkOut">): number {
  return e.checkOut === null || e.checkOut === undefined ? OPEN_END : e.checkOut;
}

/**
 * Two entries overlap iff one starts before the other ends. Deleted entries
 * and entries of other tasks never conflict — different tasks may genuinely
 * run concurrently (requirement #5), but the same task must never record the
 * same wall-clock minute twice (requirement #6).
 */
export function findOverlap(
  entries: TimeEntry[],
  taskId: string,
  start: number,
  end: number,
  excludeId: string | null = null
): TimeEntry | undefined {
  return entries.find(
    (e) =>
      e.taskId === taskId &&
      !e.deleted &&
      e.id !== excludeId &&
      start < effectiveEnd(e) &&
      e.checkIn < end
  );
}

function toRowWithDuration(e: TimeEntry): Row {
  let checkOut = e.checkOut;
  if (checkOut !== null && checkOut !== undefined && checkOut <= e.checkIn) {
    // A zero/negative-span manual entry is meaningless; close the same instant it opened.
    checkOut = e.checkIn;
  }
  const duration =
    checkOut === null || checkOut === undefined
      ? 0
      : Math.max(0, Math.round((checkOut - e.checkIn) / 1000));
  return timeEntryToRow({
    ...e,
    checkOut,
    durationSeconds: duration,
    date: dateKey(e.checkIn),
  });
}

export async function createManualEntry(input: CreateManualEntryInput): Promise<TimeEntry> {
  if (!input.taskId) throw new Error("taskId is required");
  if (!Number.isFinite(input.checkIn)) throw new Error("checkIn is required");
  const storage = getStorage();
  await storage.init();
  const entries = (await storage.readTable("TimeEntries")).map(rowToTimeEntry);

  const checkOut = input.checkOut ?? null;
  if (checkOut !== null && checkOut !== undefined && checkOut <= input.checkIn) {
    throw new Error("Check-out must be after check-in");
  }

  const conflict = findOverlap(entries, input.taskId, input.checkIn, checkOut ?? OPEN_END);
  if (conflict) {
    throw new Error(
      `Overlaps existing ${conflict.source} entry${conflict.checkOut === null ? " that is still running" : ""} for this task`
    );
  }

  if (checkOut === null) {
    const running = entries.find((e) => e.taskId === input.taskId && !e.deleted && e.checkOut === null);
    if (running) throw new Error("This task already has a running timer");
  }

  const now = toLocalIso(Date.now());
  const entry: TimeEntry = {
    id: newId(),
    taskId: input.taskId,
    subtaskId: input.subtaskId ?? "",
    sessionId: newId(),
    tag: input.tag?.trim() || "Other",
    checkIn: input.checkIn,
    checkOut,
    durationSeconds: 0,
    endReason: "",
    source: "manual",
    date: dateKey(input.checkIn),
    note: input.note ?? "",
    opId: "",
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };
  const row = toRowWithDuration(entry);
  await storage.insertRow("TimeEntries", row);
  const saved = rowToTimeEntry(row);
  await logHistory({
    taskId: input.taskId,
    type: "entry",
    kind: "added",
    message: `Manual entry added (${saved.tag})`,
  });
  return saved;
}

export async function updateManualEntry(id: string, patch: UpdateManualEntryInput): Promise<TimeEntry> {
  const storage = getStorage();
  await storage.init();
  const rows = await storage.readTable("TimeEntries");
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`Time entry ${id} not found`);
  const before = rowToTimeEntry(row);
  if (before.source !== "manual") throw new Error("Only manual entries can be edited");

  const next: TimeEntry = {
    ...before,
    subtaskId: patch.subtaskId ?? before.subtaskId,
    tag: patch.tag ?? before.tag,
    checkIn: patch.checkIn ?? before.checkIn,
    checkOut: patch.checkOut !== undefined ? patch.checkOut : before.checkOut,
    note: patch.note ?? before.note,
  };

  if (next.checkOut !== null && next.checkOut <= next.checkIn) {
    throw new Error("Check-out must be after check-in");
  }
  const conflict = findOverlap(
    [...rows.map(rowToTimeEntry)],
    before.taskId,
    next.checkIn,
    next.checkOut ?? OPEN_END,
    id
  );
  if (conflict) throw new Error("Edited entry would overlap an existing entry for this task");

  if (next.checkOut === null) {
    const running = ([...rows.map(rowToTimeEntry)].filter((e) => e.id !== id)).find(
      (e) => e.taskId === before.taskId && !e.deleted && e.checkOut === null
    );
    if (running) throw new Error("This task already has a running timer");
  }

  const updatedRow = toRowWithDuration(next);
  updatedRow.updatedAt = toLocalIso(Date.now());
  await storage.updateRow("TimeEntries", id, updatedRow);
  const saved = rowToTimeEntry(updatedRow);
  await logHistory({
    taskId: before.taskId,
    type: "entry",
    kind: "edited",
    message: `Time entry updated (${saved.tag})`,
  });
  return saved;
}

export async function deleteEntry(id: string): Promise<void> {
  const storage = getStorage();
  const rows = await storage.readTable("TimeEntries");
  const row = rows.find((r) => r.id === id);
  if (!row) return; // deleting an already-gone entry is a no-op, not an error
  await storage.updateRow("TimeEntries", id, { deleted: "true", updatedAt: toLocalIso(Date.now()) });
  await logHistory({
    taskId: row.taskId,
    type: "entry",
    kind: "removed",
    message: "Time entry deleted",
  });
}