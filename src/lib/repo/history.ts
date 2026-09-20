import { historyToRow } from "../mappers";
import { getStorage } from "../storage";
import { toLocalIso } from "../time";
import type { HistoryItem, HistoryType } from "../types";
import { newId } from "./ids";

export interface LogHistoryInput {
  taskId: string;
  type: HistoryType;
  kind?: string;
  field?: string;
  from?: string;
  to?: string;
  message?: string;
  timestamp?: number;
}

/** Every field/status/timer/plan/note change funnels through here — the single activity log per requirement #9. */
export async function logHistory(input: LogHistoryInput): Promise<HistoryItem> {
  const item: HistoryItem = {
    id: newId(),
    taskId: input.taskId,
    timestamp: toLocalIso(input.timestamp ?? Date.now()),
    type: input.type,
    kind: input.kind ?? "",
    field: input.field ?? "",
    from: input.from ?? "",
    to: input.to ?? "",
    message: input.message ?? "",
  };
  const storage = getStorage();
  await storage.insertRow("TaskHistory", historyToRow(item));
  return item;
}

/**
 * Same as calling `logHistory` in a loop, but as one append instead of one per
 * entry. A multi-field edit wrote a row per changed field, and against Sheets
 * every one of those is its own round-trip — a four-field edit spent more time
 * logging the change than making it.
 */
export async function logHistoryBatch(inputs: LogHistoryInput[]): Promise<HistoryItem[]> {
  if (inputs.length === 0) return [];
  const items: HistoryItem[] = inputs.map((input) => ({
    id: newId(),
    taskId: input.taskId,
    timestamp: toLocalIso(input.timestamp ?? Date.now()),
    type: input.type,
    kind: input.kind ?? "",
    field: input.field ?? "",
    from: input.from ?? "",
    to: input.to ?? "",
    message: input.message ?? "",
  }));
  const storage = getStorage();
  await storage.insertRows("TaskHistory", items.map(historyToRow));
  return items;
}
