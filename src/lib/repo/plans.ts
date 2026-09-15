import { dailyPlanItemToRow, rowToDailyPlanItem, rowToWeeklyPlanItem, weeklyPlanItemToRow } from "../mappers";
import { getStorage } from "../storage";
import { toLocalIso } from "../time";
import type { StorageDriver } from "../storage/types";
import type { CarrySuggestion, DailyPlanItem, StatusDef, WeeklyPlanItem } from "../types";
import { logHistory } from "./history";
import { newId } from "./ids";

export interface PlanItemInput {
  id?: string;
  taskId: string;
  subtaskId?: string;
  plannedMinutes: number;
  parallelGroup?: string;
  order?: number;
  carriedFrom?: string;
  notes?: string;
}

function isDoneStatus(name: string, statuses: StatusDef[]): boolean {
  const def = statuses.find((s) => s.name === name);
  return def?.group === "done" || def?.group === "cancelled" || name === "Completed" || name === "Closed" || name === "Cancelled";
}

/**
 * Reconciles the stored plan rows for a date/week with the client's desired
 * set, using stable client ids:
 *   - rows whose id is already in storage and still present -> update in place
 *     (preserves any columns the client does not send back, e.g. carriedFrom);
 *   - stored rows no longer in the set -> deleted;
 *   - new ids -> inserted.
 * This avoids delete-all-then-reinsert destroying history and works whether
 * the client sends its real set or a local-draft subset (offline work).
 */
async function reconcileDaily(storage: StorageDriver, date: string, items: PlanItemInput[]): Promise<void> {
  const existing = (await storage.readTable("DailyPlan"))
    .map(rowToDailyPlanItem)
    .filter((p) => p.date === date);

  const seen = new Set<string>();
  const withIds = items.filter((i) => i.id);
  const storedIds = new Set(existing.map((p) => p.id));
  const now = toLocalIso(Date.now());

  for (const item of withIds) {
    seen.add(item.id!);
    const patch: Partial<DailyPlanItem> = {
      taskId: item.taskId,
      subtaskId: item.subtaskId ?? "",
      plannedMinutes: Math.max(0, item.plannedMinutes),
      parallelGroup: item.parallelGroup ?? "",
      order: item.order ?? 0,
      carriedFrom: item.carriedFrom ?? "",
      notes: item.notes ?? "",
      updatedAt: now,
    };
    if (storedIds.has(item.id!)) {
      await storage.updateRow("DailyPlan", item.id!, dailyPlanItemToRow(patch));
    } else {
      await storage.insertRow("DailyPlan", dailyPlanItemToRow({ id: item.id!, date, ...patch, createdAt: now }));
    }
  }

  // Items without an id (newly added client-side) get one assigned server-side.
  for (const item of items.filter((i) => !i.id)) {
    const created = { ...item, id: newId(), date, createdAt: now, updatedAt: now };
    await storage.insertRow("DailyPlan", dailyPlanItemToRow({ ...created, plannedMinutes: Math.max(0, created.plannedMinutes) } as DailyPlanItem));
  }

  for (const p of existing) {
    if (!seen.has(p.id)) await storage.deleteRow("DailyPlan", p.id);
  }

  await logHistory({ taskId: "", type: "plan", kind: "daily", message: `Daily plan for ${date} updated (${items.length} items)` });
}

export async function replaceDailyPlan(date: string, items: PlanItemInput[]): Promise<DailyPlanItem[]> {
  const storage = getStorage();
  await storage.init();
  await reconcileDaily(storage, date, items);
  return (await storage.readTable("DailyPlan")).map(rowToDailyPlanItem).filter((p) => p.date === date).sort((a, b) => a.order - b.order);
}

async function reconcileWeekly(storage: StorageDriver, weekStart: string, items: PlanItemInput[]): Promise<void> {
  const existing = (await storage.readTable("WeeklyPlan"))
    .map(rowToWeeklyPlanItem)
    .filter((p) => p.weekStart === weekStart);
  const seen = new Set<string>();
  const withIds = items.filter((i) => i.id);
  const storedIds = new Set(existing.map((p) => p.id));
  const now = toLocalIso(Date.now());

  for (const item of withIds) {
    seen.add(item.id!);
    const patch: Partial<WeeklyPlanItem> = {
      taskId: item.taskId,
      plannedMinutes: Math.max(0, item.plannedMinutes),
      order: item.order ?? 0,
      carriedFrom: item.carriedFrom ?? "",
      notes: item.notes ?? "",
      updatedAt: now,
    };
    if (storedIds.has(item.id!)) {
      await storage.updateRow("WeeklyPlan", item.id!, weeklyPlanItemToRow(patch));
    } else {
      await storage.insertRow("WeeklyPlan", weeklyPlanItemToRow({ id: item.id!, weekStart, ...patch, createdAt: now }));
    }
  }
  for (const item of items.filter((i) => !i.id)) {
    const created = { ...item, id: newId(), weekStart, createdAt: now, updatedAt: now };
    await storage.insertRow("WeeklyPlan", weeklyPlanItemToRow({ ...created, plannedMinutes: Math.max(0, created.plannedMinutes) } as WeeklyPlanItem));
  }
  for (const p of existing) {
    if (!seen.has(p.id)) await storage.deleteRow("WeeklyPlan", p.id);
  }
  await logHistory({ taskId: "", type: "plan", kind: "weekly", message: `Weekly plan for ${weekStart} updated (${items.length} items)` });
}

export async function replaceWeeklyPlan(weekStart: string, items: PlanItemInput[]): Promise<WeeklyPlanItem[]> {
  const storage = getStorage();
  await storage.init();
  await reconcileWeekly(storage, weekStart, items);
  return (await storage.readTable("WeeklyPlan")).map(rowToWeeklyPlanItem).filter((p) => p.weekStart === weekStart).sort((a, b) => a.order - b.order);
}

export async function readDailyPlan(date: string): Promise<DailyPlanItem[]> {
  const storage = getStorage();
  await storage.init();
  return (await storage.readTable("DailyPlan")).map(rowToDailyPlanItem).filter((p) => p.date === date).sort((a, b) => a.order - b.order);
}

export async function readWeeklyPlan(weekStart: string): Promise<WeeklyPlanItem[]> {
  const storage = getStorage();
  await storage.init();
  return (await storage.readTable("WeeklyPlan")).map(rowToWeeklyPlanItem).filter((p) => p.weekStart === weekStart).sort((a, b) => a.order - b.order);
}

/**
 * What "should" carry from `fromDate` into `toDate`: items planned on the
 * source day whose task still isn't done/cancelled and that hasn't already
 * been re-planned on the target day (requirement #3 carry-forward).
 */
export async function computeCarrySuggestions(fromDate: string, toDate: string, statuses: StatusDef[]): Promise<CarrySuggestion[]> {
  const storage = getStorage();
  const [planRows, tasksRows, targetRows] = await Promise.all([
    storage.readTable("DailyPlan"),
    storage.readTable("Tasks"),
    storage.readTable("DailyPlan"),
  ]);
  const plan = planRows.map(rowToDailyPlanItem).filter((p) => p.date === fromDate);
  const targetTaskIds = new Set(targetRows.map(rowToDailyPlanItem).filter((p) => p.date === toDate).map((p) => p.taskId));
  const tasks = new Map(tasksRows.map((r) => [r.id, r]));

  return plan
    .filter((item) => {
      const taskRow = tasks.get(item.taskId);
      if (!taskRow || taskRow.archived === "true") return false;
      if (isDoneStatus(taskRow.status, statuses)) return false;
      return !targetTaskIds.has(item.taskId);
    })
    .map((item) => ({
      sourceDate: fromDate,
      taskId: item.taskId,
      plannedMinutes: item.plannedMinutes,
      targetDate: toDate,
    }));
}

export async function carryForwardSuggestions(suggestions: CarrySuggestion[]): Promise<DailyPlanItem[]> {
  const storage = getStorage();
  await storage.init();
  const byDate = new Map<string, CarrySuggestion[]>();
  for (const s of suggestions) {
    const arr = byDate.get(s.targetDate) ?? [];
    arr.push(s);
    byDate.set(s.targetDate, arr);
  }
  const now = toLocalIso(Date.now());
  for (const [date, list] of byDate) {
    const existing = (await storage.readTable("DailyPlan")).map(rowToDailyPlanItem).filter((p) => p.date === date);
    const existingTaskIds = new Set(existing.map((p) => p.taskId));
    let order = existing.reduce((max, p) => Math.max(max, p.order), 0);
    for (const s of list) {
      if (existingTaskIds.has(s.taskId)) continue; // already planned today
      order += 1;
      await storage.insertRow("DailyPlan", dailyPlanItemToRow({
        id: newId(),
        date,
        taskId: s.taskId,
        plannedMinutes: s.plannedMinutes,
        parallelGroup: "",
        order,
        carriedFrom: s.sourceDate,
        notes: "",
        createdAt: now,
        updatedAt: now,
      }));
    }
    await logHistory({ taskId: "", type: "plan", kind: "carry", message: `Carried ${list.length} item(s) into ${date}` });
  }
  return (await storage.readTable("DailyPlan")).map(rowToDailyPlanItem);
}