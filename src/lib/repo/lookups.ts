import { getStorage } from "../storage";
import type { TableName } from "../types";

export type LookupTable = Extract<TableName, "Categories" | "Priorities" | "Statuses" | "ActivityTags">;

/** Lookup rows are keyed by name — renaming isn't supported (task rows reference the name as plain text). */
export async function addLookupItem(table: LookupTable, values: Record<string, string>): Promise<void> {
  if (!values.name?.trim()) throw new Error("Name is required");
  const storage = getStorage();
  const existing = await storage.readTable(table);
  if (existing.some((r) => r.name === values.name)) throw new Error(`"${values.name}" already exists`);
  const order = values.order ?? String(existing.length + 1);
  await storage.insertRow(table, { active: "true", ...values, order });
}

export async function updateLookupItem(table: LookupTable, name: string, patch: Record<string, string>): Promise<void> {
  const storage = getStorage();
  const updated = await storage.updateRow(table, name, patch);
  if (!updated) throw new Error(`"${name}" not found in ${table}`);
}

/**
 * Deactivates rather than deletes: task rows already carry this name as
 * plain text, so removing the row would orphan them. Deactivated items drop
 * out of pickers but stay valid on tasks that already used them.
 */
export async function deactivateLookupItem(table: LookupTable, name: string): Promise<void> {
  await updateLookupItem(table, name, { active: "false" });
}

export async function reactivateLookupItem(table: LookupTable, name: string): Promise<void> {
  await updateLookupItem(table, name, { active: "true" });
}
