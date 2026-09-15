import { buildSnapshot } from "@/lib/repo/snapshot";
import { api } from "@/lib/api/respond";
import { getStorage } from "@/lib/storage";

/** Manual re-read of every tab, returning a fresh snapshot. */
export async function POST(): Promise<Response> {
  return api(async () => {
    await getStorage().init();
    return buildSnapshot();
  });
}