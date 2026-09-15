import { api, readJson } from "@/lib/api/respond";
import { readDailyPlan, replaceDailyPlan } from "@/lib/repo";
import type { PlanItemInput } from "@/lib/repo";

function parseItems(b: Record<string, unknown>): PlanItemInput[] {
  const raw = b.items;
  if (!Array.isArray(raw)) throw new Error("items must be an array");
  return raw.map((it) => {
    const item = (it ?? {}) as Record<string, unknown>;
    return {
      id: typeof item.id === "string" ? item.id : undefined,
      taskId: String(item.taskId ?? ""),
      subtaskId: typeof item.subtaskId === "string" ? item.subtaskId : undefined,
      plannedMinutes: Math.max(0, Number(item.plannedMinutes ?? 0) || 0),
      parallelGroup: typeof item.parallelGroup === "string" ? item.parallelGroup : undefined,
      order: typeof item.order === "number" ? item.order : Number(item.order) || 0,
      carriedFrom: typeof item.carriedFrom === "string" ? item.carriedFrom : undefined,
      notes: typeof item.notes === "string" ? item.notes : undefined,
    };
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ date: string }> }): Promise<Response> {
  return api(async () => {
    const { date } = await ctx.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date — use YYYY-MM-DD");
    return readDailyPlan(date);
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ date: string }> }): Promise<Response> {
  return api(async () => {
    const { date } = await ctx.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Invalid date — use YYYY-MM-DD");
    const b = await readJson(req);
    return replaceDailyPlan(date, parseItems(b));
  });
}