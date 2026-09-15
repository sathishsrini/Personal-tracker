import { GoogleSheetsDriver } from "./sheets";
import { LocalJsonDriver } from "./local";
import type { StorageDriver } from "./types";

export type { StorageDriver } from "./types";

function createDriver(): StorageDriver {
  const forced = process.env.STORAGE_DRIVER;
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const hasCreds = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS || (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY)
  );

  if (forced === "local") return new LocalJsonDriver();
  if (forced === "sheets" || (!forced && spreadsheetId && hasCreds)) {
    if (!spreadsheetId) {
      throw new Error("STORAGE_DRIVER=sheets but GOOGLE_SHEETS_SPREADSHEET_ID is not set. See .env.example.");
    }
    return new GoogleSheetsDriver(spreadsheetId);
  }
  return new LocalJsonDriver();
}

// Next.js dev (Turbopack/webpack) hot-reloads route modules, which would
// otherwise spin up a fresh driver — and a fresh in-process write queue and
// header cache — on every edit. Pin one instance on `globalThis` like the
// standard Prisma-client pattern so the timer/write queue survives HMR.
const g = globalThis as unknown as { __trackerStorage?: StorageDriver };

export function getStorage(): StorageDriver {
  if (!g.__trackerStorage) g.__trackerStorage = createDriver();
  return g.__trackerStorage;
}
