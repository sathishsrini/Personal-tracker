import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALL_TABLES } from "../schema";
import type { Row, StorageInfo, TableName } from "../types";
import { seedDefaultsIfEmpty } from "./seed";
import type { StorageDriver } from "./types";

type DB = Record<TableName, Row[]>;

function emptyDb(): DB {
  const db = {} as DB;
  for (const name of Object.keys(ALL_TABLES) as TableName[]) db[name] = [];
  return db;
}

/**
 * Zero-config fallback so the app runs before Google credentials are set up:
 * the same table/row model, persisted as one JSON file. All mutations go
 * through a single in-process queue so concurrent requests (e.g. a rapid
 * start/stop double-click) can never interleave a read-modify-write and
 * silently drop a row — the exact class of bug requirement #6 calls out.
 */
export class LocalJsonDriver implements StorageDriver {
  readonly kind = "local" as const;
  private filePath: string;
  private queue: Promise<unknown> = Promise.resolve();
  private lastError: string | null = null;
  private lastSyncedAt: number | null = null;

  constructor(filePath = process.env.TRACKER_LOCAL_DB ? path.resolve(process.env.TRACKER_LOCAL_DB) : path.join(process.cwd(), "data", "local-db.json")) {
    this.filePath = filePath;
  }

  getInfo(): StorageInfo {
    return {
      kind: "local",
      label: `Local file (${path.relative(process.cwd(), this.filePath)})`,
      url: null,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError,
    };
  }

  private async load(): Promise<DB> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<DB>;
      const db = emptyDb();
      for (const name of Object.keys(db) as TableName[]) db[name] = parsed[name] ?? [];
      this.lastSyncedAt = Date.now();
      this.lastError = null;
      return db;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return emptyDb();
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  private async save(db: DB): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(db, null, 2), "utf-8");
    await rename(tmp, this.filePath);
    this.lastSyncedAt = Date.now();
  }

  /** Serializes every mutation (and the init seed) through one chain. */
  private mutate<T>(fn: (db: DB) => Promise<T> | T): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.load();
      const result = await fn(db);
      await this.save(db);
      return result;
    });
    // Swallow rejection in the chain itself so one failed op doesn't wedge the queue;
    // the caller's own awaited promise still rejects normally.
    this.queue = run.catch(() => undefined);
    return run;
  }

  async init(): Promise<void> {
    await this.mutate(async () => {
      // no-op body; ensures the file exists
    });
    await seedDefaultsIfEmpty(this);
  }

  async readTable(table: TableName): Promise<Row[]> {
    const db = await this.load();
    return db[table];
  }

  async readAll(): Promise<Record<TableName, Row[]>> {
    return this.load();
  }

  async insertRow(table: TableName, values: Row): Promise<Row> {
    return this.mutate((db) => {
      db[table].push(values);
      return values;
    });
  }

  async insertRows(table: TableName, values: Row[]): Promise<Row[]> {
    return this.mutate((db) => {
      db[table].push(...values);
      return values;
    });
  }

  async updateRow(table: TableName, idValue: string, patch: Row): Promise<Row | null> {
    const idKey = ALL_TABLES[table].idKey;
    return this.mutate((db) => {
      const row = db[table].find((r) => r[idKey] === idValue);
      if (!row) return null;
      Object.assign(row, patch);
      return row;
    });
  }

  async claimBlankRows(table: TableName, computeDefaults: (row: Row) => Row | null): Promise<Row[]> {
    const idKey = ALL_TABLES[table].idKey;
    return this.mutate((db) => {
      const claimed: Row[] = [];
      for (const row of db[table]) {
        if (row[idKey]) continue;
        const defaults = computeDefaults(row);
        if (!defaults) continue;
        Object.assign(row, defaults);
        claimed.push(row);
      }
      return claimed;
    });
  }

  async deleteRow(table: TableName, idValue: string): Promise<boolean> {
    const idKey = ALL_TABLES[table].idKey;
    return this.mutate((db) => {
      const before = db[table].length;
      db[table] = db[table].filter((r) => r[idKey] !== idValue);
      return db[table].length < before;
    });
  }
}
