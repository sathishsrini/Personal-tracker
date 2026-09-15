/**
 * Ensures every tab/header exists in the spreadsheet and seeds the default
 * lookup rows. Reads credentials from `.env` (GOOGLE_* vars) if present.
 *
 *   npm run sheets:init
 *
 * Run once when you first connect a spreadsheet (and after cloning fresh).
 */
import { existsSync } from "node:fs";
import { ALL_TABLES } from "../src/lib/schema";
import { getStorage } from "../src/lib/storage";

function loadEnvFile(): void {
  if (existsSync(".env") && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(".env");
    } catch {
      // .env present but unreadable — continue with the ambient environment.
    }
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const storage = getStorage();
  await storage.init();

  const info = storage.getInfo();
  const tables = Object.keys(ALL_TABLES);
  console.log(
    [
      `Storage: ${info.label}`,
      `Tabs ensured (${tables.length}): ${tables.join(", ")}`,
      info.url ? `Spreadsheet: ${info.url}` : "",
      info.lastSyncedAt ? `Synced at: ${new Date(info.lastSyncedAt).toISOString()}` : "",
    ]
      .filter(Boolean)
      .join("\n")
  );
}

main().catch((err: unknown) => {
  console.error(`sheets:init failed — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});