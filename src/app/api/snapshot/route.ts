import { buildSnapshot } from "@/lib/repo/snapshot";
import { api } from "@/lib/api/respond";

export async function GET(): Promise<Response> {
  return api(() => buildSnapshot());
}