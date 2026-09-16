import { api, readJson } from "@/lib/api/respond";
import { reorderTasks } from "@/lib/repo";
import type { ReorderUpdate } from "@/lib/repo";

/** POST /api/tasks/reorder — bulk drag-and-drop reorder/re-prioritize. Body: { updates: ReorderUpdate[] } */
export async function POST(req: Request): Promise<Response> {
  return api(async () => {
    const b = await readJson(req);
    const raw = b.updates;
    if (!Array.isArray(raw)) throw new Error("updates must be an array");
    const updates: ReorderUpdate[] = raw.map((u) => {
      const it = (u ?? {}) as Record<string, unknown>;
      if (typeof it.id !== "string" || !it.id) throw new Error("Each update needs an id");
      return {
        id: it.id,
        order: Number(it.order) || 0,
        priority: typeof it.priority === "string" && it.priority ? it.priority : undefined,
      };
    });
    await reorderTasks(updates);
    return { ok: true };
  });
}
