import { DEFAULT_CATEGORIES, DEFAULT_PRIORITIES, DEFAULT_STATUSES, DEFAULT_TAGS } from "../schema";
import type { Row } from "../types";
import type { StorageDriver } from "./types";

export const DEFAULT_SETTINGS_ROWS: Row[] = [
  { key: "workdayHours", value: "8" },
  { key: "workdayStart", value: "09:00" },
  { key: "workDays", value: "1,2,3,4,5" },
  { key: "weekStartsOn", value: "1" },
  { key: "timerMode", value: "concurrent" },
  { key: "concurrencyMode", value: "split" },
  { key: "maxTimerHours", value: "12" },
  { key: "quadrantThreshold", value: "5.5" },
  { key: "defaultTag", value: "Development" },
  { key: "defaultCategory", value: "General" },
  { key: "defaultType", value: "Daily" },
  { key: "weight.priority", value: "0.28" },
  { key: "weight.impact", value: "0.22" },
  { key: "weight.effort", value: "0.14" },
  { key: "weight.deadline", value: "0.2" },
  { key: "weight.fit", value: "0.1" },
  { key: "weight.planned", value: "0.03" },
  { key: "weight.momentum", value: "0.03" },
];

/**
 * Populates the lookup tables (Categories/Priorities/Statuses/ActivityTags)
 * and Settings the first time they're empty, so the app is usable the
 * moment a spreadsheet is connected — no manual setup sheet required.
 */
export async function seedDefaultsIfEmpty(driver: StorageDriver): Promise<void> {
  const [categories, priorities, statuses, tags, settings] = await Promise.all([
    driver.readTable("Categories"),
    driver.readTable("Priorities"),
    driver.readTable("Statuses"),
    driver.readTable("ActivityTags"),
    driver.readTable("Settings"),
  ]);

  if (categories.length === 0) {
    await driver.insertRows(
      "Categories",
      DEFAULT_CATEGORIES.map((name, i) => ({ name, color: "", active: "true", order: String(i + 1) }))
    );
  }
  if (priorities.length === 0) {
    await driver.insertRows(
      "Priorities",
      DEFAULT_PRIORITIES.map((p) => ({ name: p.name, rank: String(p.rank), weight: String(p.weight), color: p.color }))
    );
  }
  if (statuses.length === 0) {
    await driver.insertRows(
      "Statuses",
      DEFAULT_STATUSES.map((s) => ({ name: s.name, group: s.group, color: s.color, order: String(s.order) }))
    );
  }
  if (tags.length === 0) {
    await driver.insertRows(
      "ActivityTags",
      DEFAULT_TAGS.map((name, i) => ({ name, color: "", active: "true", order: String(i + 1) }))
    );
  }
  if (settings.length === 0) {
    await driver.insertRows("Settings", DEFAULT_SETTINGS_ROWS);
  }
}
