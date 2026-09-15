import { api, readJson } from "@/lib/api/respond";
import { carryForwardSuggestions } from "@/lib/repo";
import type { CarrySuggestion } from "@/lib/types";

export async function POST(req: Request): Promise<Response> {
  return api(async () => {
    const b = await readJson(req);
    const raw = b.suggestions;
    if (!Array.isArray(raw)) throw new Error("suggestions must be an array");
    const suggestions: CarrySuggestion[] = raw.map((s) => {
      const it = (s ?? {}) as Record<string, unknown>;
      return {
        sourceDate: String(it.sourceDate ?? ""),
        targetDate: String(it.targetDate ?? ""),
        taskId: String(it.taskId ?? ""),
        plannedMinutes: Math.max(0, Number(it.plannedMinutes ?? 0) || 0),
      };
    });
    return carryForwardSuggestions(suggestions);
  });
}