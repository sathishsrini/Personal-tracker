import { getStorage } from "../storage";
import { DEFAULT_SETTINGS_ROWS } from "../storage/seed";
import type { RecommendationWeights, Row, Settings } from "../types";

const DEFAULTS = Object.fromEntries(DEFAULT_SETTINGS_ROWS.map((r) => [r.key, r.value]));

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return v !== undefined && Number.isFinite(n) ? n : fallback;
}

export function rowsToSettings(rows: Row[]): Settings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const get = (key: string) => map.get(key) ?? DEFAULTS[key];

  const weights: RecommendationWeights = {
    priority: num(get("weight.priority"), 0.28),
    impact: num(get("weight.impact"), 0.22),
    effort: num(get("weight.effort"), 0.14),
    deadline: num(get("weight.deadline"), 0.2),
    fit: num(get("weight.fit"), 0.1),
    planned: num(get("weight.planned"), 0.03),
    momentum: num(get("weight.momentum"), 0.03),
  };

  const workDaysRaw = get("workDays") ?? "1,2,3,4,5";
  const workDays = workDaysRaw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);

  const timerMode = get("timerMode") === "single" ? "single" : "concurrent";
  const concurrencyMode = get("concurrencyMode") === "full" ? "full" : "split";

  return {
    workdayHours: num(get("workdayHours"), 8),
    workdayStart: get("workdayStart") ?? "09:00",
    workDays: workDays.length > 0 ? workDays : [1, 2, 3, 4, 5],
    weekStartsOn: num(get("weekStartsOn"), 1),
    timerMode,
    concurrencyMode,
    maxTimerHours: num(get("maxTimerHours"), 12),
    quadrantThreshold: num(get("quadrantThreshold"), 5.5),
    defaultTag: get("defaultTag") ?? "Development",
    defaultCategory: get("defaultCategory") ?? "General",
    defaultType: get("defaultType") ?? "Daily",
    weights,
  };
}

export function settingsToRows(settings: Partial<Settings>): Row[] {
  const rows: Row[] = [];
  const set = (key: string, value: string) => rows.push({ key, value });
  if (settings.workdayHours !== undefined) set("workdayHours", String(settings.workdayHours));
  if (settings.workdayStart !== undefined) set("workdayStart", settings.workdayStart);
  if (settings.workDays !== undefined) set("workDays", settings.workDays.join(","));
  if (settings.weekStartsOn !== undefined) set("weekStartsOn", String(settings.weekStartsOn));
  if (settings.timerMode !== undefined) set("timerMode", settings.timerMode);
  if (settings.concurrencyMode !== undefined) set("concurrencyMode", settings.concurrencyMode);
  if (settings.maxTimerHours !== undefined) set("maxTimerHours", String(settings.maxTimerHours));
  if (settings.quadrantThreshold !== undefined) set("quadrantThreshold", String(settings.quadrantThreshold));
  if (settings.defaultTag !== undefined) set("defaultTag", settings.defaultTag);
  if (settings.defaultCategory !== undefined) set("defaultCategory", settings.defaultCategory);
  if (settings.defaultType !== undefined) set("defaultType", settings.defaultType);
  if (settings.weights) {
    for (const [k, v] of Object.entries(settings.weights)) set(`weight.${k}`, String(v));
  }
  return rows;
}

export async function getSettings(): Promise<Settings> {
  const storage = getStorage();
  await storage.init();
  const rows = await storage.readTable("Settings");
  return rowsToSettings(rows);
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const storage = getStorage();
  await storage.init();
  const rows = settingsToRows(patch);
  const existing = await storage.readTable("Settings");
  const existingKeys = new Set(existing.map((r) => r.key));
  const toInsert = rows.filter((r) => !existingKeys.has(r.key));
  const toUpdate = rows.filter((r) => existingKeys.has(r.key));
  await Promise.all([
    ...toUpdate.map((r) => storage.updateRow("Settings", r.key, { value: r.value })),
    toInsert.length > 0 ? storage.insertRows("Settings", toInsert) : Promise.resolve(),
  ]);
  return getSettings();
}
