import { buildSnapshot } from "@/lib/repo/snapshot";
import { api } from "@/lib/api/respond";
import { getStorage } from "@/lib/storage";

/**
 * Manual sync: forces a fresh schema check (picks up columns you renamed or
 * added by hand directly in the sheet, not just new row data — which every
 * request already reads live regardless), then returns a fresh snapshot.
 */
export async function POST(): Promise<Response> {
  return api(async () => {
    await getStorage().resync();
    return buildSnapshot();
  });
}