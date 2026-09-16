import { readFile } from "node:fs/promises";
import { sheets as sheetsFactory, sheets_v4 } from "@googleapis/sheets";
import { JWT } from "google-auth-library";
import { ALL_TABLES } from "../schema";
import type { Row, StorageInfo, TableName } from "../types";
import { seedDefaultsIfEmpty } from "./seed";
import type { StorageDriver } from "./types";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// gaxios (the HTTP client under googleapis) has NO default request timeout —
// a connection that goes dead (a pooled keep-alive socket silently dropped by
// a NAT/firewall/proxy, common on home networks) hangs forever instead of
// erroring, since no timeout ever fires to abort it. Every call gets a hard
// cap so a dead connection surfaces as a normal retryable error instead of
// wedging the whole request indefinitely.
const REQUEST_TIMEOUT_MS = 15_000;

interface TableColumns {
  /** Header row exactly as it exists in the sheet (canonical columns + any of the user's own extra ones). */
  headers: string[];
  keyToIndex: Map<string, number>;
  sheetId: number;
}

function colLetter(index0: number): string {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

/** A finite-number string is written as a real numeric cell; everything else is written as literal text (RAW). */
function cellValue(raw: string): string | number {
  if (raw !== "" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  return raw;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// gaxios reports a network-level failure (dead/reset connection, our own
// REQUEST_TIMEOUT_MS abort, DNS blip) via a string `code` rather than an
// HTTP status number — these are exactly as transient as a 429/5xx and
// should be retried the same way.
const RETRYABLE_ERROR_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "ENOTFOUND", "TimeoutError", "AbortError"]);

/** Retries transient Sheets API failures (rate limiting, momentary 5xx, dropped connections) with backoff. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const code = (err as { code?: number | string })?.code ?? (err as { status?: number })?.status;
      const retryable = code === 429 || (typeof code === "number" && code >= 500) || (typeof code === "string" && RETRYABLE_ERROR_CODES.has(code));
      if (!retryable || i === attempts - 1) throw err;
      console.warn(`[sheets] attempt ${i + 1} failed (${code}), retrying: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(300 * 2 ** i + Math.random() * 200);
    }
  }
  throw lastErr;
}

async function buildAuth(): Promise<JWT> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (email && key) {
    return new JWT({ email, key: key.replace(/\\n/g, "\n"), scopes: SCOPES });
  }
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile) {
    const raw = JSON.parse(await readFile(keyFile, "utf-8")) as { client_email: string; private_key: string };
    return new JWT({ email: raw.client_email, key: raw.private_key, scopes: SCOPES });
  }
  throw new Error(
    "No Google credentials configured. Set GOOGLE_APPLICATION_CREDENTIALS (path to a service-account JSON key) " +
      "or GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY. See .env.example."
  );
}

/**
 * Google Sheets-backed storage driver.
 *
 * All mutations are serialized through one queue (see `mutate`) so two
 * near-simultaneous requests — e.g. a double-clicked Stop button — can never
 * interleave a row lookup with another call's row deletion/insertion and
 * corrupt state. Row lookups (`findRowIndex`) are always re-read fresh
 * immediately before a write, never cached across requests.
 */
export class GoogleSheetsDriver implements StorageDriver {
  readonly kind = "sheets" as const;
  private spreadsheetId: string;
  private api: sheets_v4.Sheets | null = null;
  private columns = new Map<TableName, TableColumns>();
  private initPromise: Promise<void> | null = null;
  /** True while `ensureSchema()` itself is running, so its own reads/writes (e.g. seeding defaults) don't re-await `initPromise` and deadlock on themselves. */
  private initializing = false;
  private queue: Promise<unknown> = Promise.resolve();
  private lastError: string | null = null;
  private lastSyncedAt: number | null = null;

  constructor(spreadsheetId: string) {
    this.spreadsheetId = spreadsheetId;
  }

  getInfo(): StorageInfo {
    return {
      kind: "sheets",
      label: "Google Sheets",
      url: `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`,
      lastSyncedAt: this.lastSyncedAt,
      error: this.lastError,
    };
  }

  private async getApi(): Promise<sheets_v4.Sheets> {
    if (!this.api) {
      const auth = await buildAuth();
      this.api = sheetsFactory({ version: "v4", auth, timeout: REQUEST_TIMEOUT_MS });
    }
    return this.api;
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initializing = true;
      this.initPromise = this.ensureSchema().finally(() => {
        this.initializing = false;
      });
    }
    try {
      await this.initPromise;
      this.lastError = null;
    } catch (err) {
      this.initPromise = null; // allow retry on next call
      this.lastError = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  async resync(): Promise<void> {
    this.initPromise = null; // drop the cached success so init() re-runs ensureSchema for real
    await this.init();
  }

  /**
   * Guards every read/write with auto-init, except when called from within
   * `ensureSchema()` itself (e.g. `seedDefaultsIfEmpty`'s reads/writes): at
   * that point `this.columns` is already populated (the header-mapping loop
   * runs before seeding), so re-awaiting `initPromise` would just be awaiting
   * the very call that's currently executing it — a permanent deadlock.
   */
  private async ensureReady(): Promise<void> {
    if (this.initializing) return;
    await this.init();
  }

  private async ensureSchema(): Promise<void> {
    const api = await this.getApi();
    const meta = await withRetry(() =>
      api.spreadsheets.get({ spreadsheetId: this.spreadsheetId, fields: "sheets.properties" })
    );
    const existing = new Map((meta.data.sheets ?? []).map((s) => [s.properties!.title!, s.properties!.sheetId!]));

    const missingTitles = (Object.keys(ALL_TABLES) as TableName[]).filter((t) => !existing.has(ALL_TABLES[t].sheetTitle));
    if (missingTitles.length > 0) {
      const res = await withRetry(() =>
        api.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: missingTitles.map((t) => ({ addSheet: { properties: { title: ALL_TABLES[t].sheetTitle } } })),
          },
        })
      );
      for (const reply of res.data.replies ?? []) {
        const props = reply.addSheet?.properties;
        if (props?.title) existing.set(props.title, props.sheetId!);
      }
    }

    // Read every tab's current header row in one call.
    const tables = Object.keys(ALL_TABLES) as TableName[];
    const headerRanges = tables.map((t) => `${ALL_TABLES[t].sheetTitle}!1:1`);
    const headerRes = await withRetry(() =>
      api.spreadsheets.values.batchGet({ spreadsheetId: this.spreadsheetId, ranges: headerRanges, valueRenderOption: "UNFORMATTED_VALUE" })
    );

    const headerWrites: { range: string; values: string[][] }[] = [];

    tables.forEach((table, i) => {
      const spec = ALL_TABLES[table];
      const currentHeaders = ((headerRes.data.valueRanges?.[i]?.values?.[0] as string[] | undefined) ?? []).map((h) => String(h));

      const finalHeaders = currentHeaders.slice();
      const keyToIndex = new Map<string, number>();
      const usedIndices = new Set<number>();

      for (const colSpec of spec.columns) {
        const candidates = [colSpec.header, colSpec.key, ...(colSpec.aliases ?? [])].map(normalizeHeader);
        const idx = finalHeaders.findIndex((h, hi) => !usedIndices.has(hi) && candidates.includes(normalizeHeader(h)));
        if (idx >= 0) {
          usedIndices.add(idx);
          keyToIndex.set(colSpec.key, idx);
          if (finalHeaders[idx] !== colSpec.header) finalHeaders[idx] = colSpec.header; // rename in place, e.g. "Task" -> "Task"
        } else {
          keyToIndex.set(colSpec.key, finalHeaders.length);
          finalHeaders.push(colSpec.header);
        }
      }

      const changed = finalHeaders.length !== currentHeaders.length || finalHeaders.some((h, hi) => h !== currentHeaders[hi]);
      if (changed) headerWrites.push({ range: `${spec.sheetTitle}!A1`, values: [finalHeaders] });

      this.columns.set(table, { headers: finalHeaders, keyToIndex, sheetId: existing.get(spec.sheetTitle)! });
    });

    if (headerWrites.length > 0) {
      await withRetry(() =>
        api.spreadsheets.values.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: { valueInputOption: "RAW", data: headerWrites },
        })
      );
    }

    await seedDefaultsIfEmpty(this);
    this.lastSyncedAt = Date.now();
  }

  private cols(table: TableName): TableColumns {
    const c = this.columns.get(table);
    if (!c) throw new Error(`Storage not initialized: unknown columns for ${table}`);
    return c;
  }

  private rowToRecord(table: TableName, values: unknown[]): Row {
    const { keyToIndex } = this.cols(table);
    const row: Row = {};
    for (const [key, idx] of keyToIndex) {
      const v = values[idx];
      row[key] = v === undefined || v === null ? "" : String(v);
    }
    return row;
  }

  private recordToRowArray(table: TableName, record: Row): (string | number)[] {
    const { headers, keyToIndex } = this.cols(table);
    const arr: (string | number)[] = new Array(headers.length).fill("");
    for (const [key, value] of Object.entries(record)) {
      const idx = keyToIndex.get(key);
      if (idx !== undefined) arr[idx] = cellValue(value ?? "");
    }
    return arr;
  }

  /** Serializes every write so lookups+mutations on the same table never interleave. */
  private mutate<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  async readTable(table: TableName): Promise<Row[]> {
    await this.ensureReady();
    const api = await this.getApi();
    const { headers, sheetId } = this.cols(table);
    void sheetId;
    const lastCol = colLetter(Math.max(headers.length - 1, 0));
    const range = `${ALL_TABLES[table].sheetTitle}!A2:${lastCol}`;
    const res = await withRetry(() =>
      api.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range, valueRenderOption: "UNFORMATTED_VALUE" })
    );
    this.lastSyncedAt = Date.now();
    const rows = res.data.values ?? [];
    return rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== "")).map((r) => this.rowToRecord(table, r));
  }

  async readAll(): Promise<Record<TableName, Row[]>> {
    await this.ensureReady();
    const api = await this.getApi();
    const tables = Object.keys(ALL_TABLES) as TableName[];
    const ranges = tables.map((t) => {
      const { headers } = this.cols(t);
      return `${ALL_TABLES[t].sheetTitle}!A2:${colLetter(Math.max(headers.length - 1, 0))}`;
    });
    const res = await withRetry(() =>
      api.spreadsheets.values.batchGet({ spreadsheetId: this.spreadsheetId, ranges, valueRenderOption: "UNFORMATTED_VALUE" })
    );
    this.lastSyncedAt = Date.now();
    const out = {} as Record<TableName, Row[]>;
    tables.forEach((table, i) => {
      const rows = (res.data.valueRanges?.[i]?.values ?? []) as unknown[][];
      out[table] = rows.filter((r) => r.some((cell) => String(cell ?? "").trim() !== "")).map((r) => this.rowToRecord(table, r));
    });
    return out;
  }

  private async findRowIndex(table: TableName, idValue: string): Promise<number> {
    const api = await this.getApi();
    const idKey = ALL_TABLES[table].idKey;
    const idColIndex = this.cols(table).keyToIndex.get(idKey) ?? 0;
    const letter = colLetter(idColIndex);
    const res = await withRetry(() =>
      api.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${ALL_TABLES[table].sheetTitle}!${letter}2:${letter}`,
        valueRenderOption: "UNFORMATTED_VALUE",
      })
    );
    const rows = res.data.values ?? [];
    const idx = rows.findIndex((r) => String(r[0] ?? "") === idValue);
    return idx === -1 ? -1 : idx + 2; // 1-indexed, +1 for header row
  }

  async insertRow(table: TableName, values: Row): Promise<Row> {
    await this.insertRows(table, [values]);
    return values;
  }

  async insertRows(table: TableName, values: Row[]): Promise<Row[]> {
    await this.ensureReady();
    return this.mutate(async () => {
      const api = await this.getApi();
      const arrays = values.map((v) => this.recordToRowArray(table, v));
      await withRetry(() =>
        api.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${ALL_TABLES[table].sheetTitle}!A1`,
          valueInputOption: "RAW",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values: arrays },
        })
      );
      this.lastSyncedAt = Date.now();
      return values;
    });
  }

  async updateRow(table: TableName, idValue: string, patch: Row): Promise<Row | null> {
    await this.ensureReady();
    return this.mutate(async () => {
      const api = await this.getApi();
      const rowIndex = await this.findRowIndex(table, idValue);
      if (rowIndex === -1) return null;
      const { keyToIndex } = this.cols(table);
      const data = Object.entries(patch)
        .filter(([key]) => keyToIndex.has(key))
        .map(([key, value]) => {
          const letter = colLetter(keyToIndex.get(key)!);
          return { range: `${ALL_TABLES[table].sheetTitle}!${letter}${rowIndex}`, values: [[cellValue(value ?? "")]] };
        });
      if (data.length > 0) {
        await withRetry(() =>
          api.spreadsheets.values.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { valueInputOption: "RAW", data },
          })
        );
      }
      this.lastSyncedAt = Date.now();
      const idKey = ALL_TABLES[table].idKey;
      return { [idKey]: idValue, ...patch };
    });
  }

  async claimBlankRows(table: TableName, computeDefaults: (row: Row) => Row | null): Promise<Row[]> {
    await this.ensureReady();
    return this.mutate(async () => {
      const api = await this.getApi();
      const { headers, keyToIndex } = this.cols(table);
      const idKey = ALL_TABLES[table].idKey;
      const idColIndex = keyToIndex.get(idKey) ?? 0;
      const lastCol = colLetter(Math.max(headers.length - 1, 0));
      // Fresh read, deliberately bypassing any cached view — row positions must be current.
      const res = await withRetry(() =>
        api.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${ALL_TABLES[table].sheetTitle}!A2:${lastCol}`,
          valueRenderOption: "UNFORMATTED_VALUE",
        })
      );
      const rows = res.data.values ?? [];
      const claimed: Row[] = [];
      const data: { range: string; values: (string | number)[][] }[] = [];

      rows.forEach((raw, i) => {
        if (String(raw[idColIndex] ?? "").trim() !== "") return; // already has an id
        const record = this.rowToRecord(table, raw);
        const defaults = computeDefaults(record);
        if (!defaults) return;
        const merged = { ...record, ...defaults };
        const sheetRow = i + 2;
        for (const [key, value] of Object.entries(defaults)) {
          const idx = keyToIndex.get(key);
          if (idx === undefined) continue;
          data.push({ range: `${ALL_TABLES[table].sheetTitle}!${colLetter(idx)}${sheetRow}`, values: [[cellValue(value ?? "")]] });
        }
        claimed.push(merged);
      });

      if (data.length > 0) {
        await withRetry(() =>
          api.spreadsheets.values.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { valueInputOption: "RAW", data },
          })
        );
        this.lastSyncedAt = Date.now();
      }
      return claimed;
    });
  }

  async deleteRow(table: TableName, idValue: string): Promise<boolean> {
    await this.ensureReady();
    return this.mutate(async () => {
      const api = await this.getApi();
      const rowIndex = await this.findRowIndex(table, idValue);
      if (rowIndex === -1) return false;
      const { sheetId } = this.cols(table);
      await withRetry(() =>
        api.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex - 1, endIndex: rowIndex } } },
            ],
          },
        })
      );
      this.lastSyncedAt = Date.now();
      return true;
    });
  }
}
