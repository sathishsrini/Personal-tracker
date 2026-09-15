import type { Row, StorageInfo, TableName } from "../types";

/**
 * Row-level storage contract. Rows are plain string maps keyed by the
 * canonical field keys from `schema.ts` (not spreadsheet headers, not typed
 * domain objects — that translation happens one layer up, in `repo.ts`).
 * Both the Google Sheets driver and the local JSON fallback implement this
 * so the rest of the app never needs to know which one is active.
 */
export interface StorageDriver {
  readonly kind: "sheets" | "local";

  /** Ensures tabs/headers/default lookup rows exist. Safe to call repeatedly. */
  init(): Promise<void>;

  getInfo(): StorageInfo;

  readTable(table: TableName): Promise<Row[]>;
  readAll(): Promise<Record<TableName, Row[]>>;

  /** Appends a new row. `values` must already contain the id/key column. */
  insertRow(table: TableName, values: Row): Promise<Row>;
  insertRows(table: TableName, values: Row[]): Promise<Row[]>;

  /** Merges `patch` into the row whose id column equals `idValue`. Returns null if not found. */
  updateRow(table: TableName, idValue: string, patch: Row): Promise<Row | null>;

  deleteRow(table: TableName, idValue: string): Promise<boolean>;

  /**
   * Backfills rows that were typed by hand and are missing their id/key
   * column — the "just type a Task title" input path (requirement #15).
   * Does a fresh read (never a cached one), calls `computeDefaults` for
   * every row whose id column is still blank, and writes the result back to
   * that exact row in place. Rows for which `computeDefaults` returns null
   * are left untouched (e.g. a fully blank trailing line). Returns every
   * row that was claimed, already merged with its patch.
   */
  claimBlankRows(table: TableName, computeDefaults: (row: Row) => Row | null): Promise<Row[]>;
}
