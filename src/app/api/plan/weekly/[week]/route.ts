import { api, readJson } from "@/lib/api/respond";
import { readWeeklyPlan, replaceWeeklyPlan } from "@/lib/repo";
import type { PlanItemInput } from "@/lib/repo";

function parseItems(b: Record<string, unknown>): PlanItemInput[] {
  const raw = b.items;
  if (!Array.isArray(raw)) throw new Error("items must be an array");
  return raw.map((it) => {
    const item = (it ?? {}) as Record<string, unknown>;
    return {
      id: typeof item.id === "string" ? item.id : undefined,
      taskId: String(item.taskId ?? ""),
      plannedMinutes: Math.max(0, Number(item.plannedMinutes ?? 0) || 0),
      order: typeof item.order === "number" ? item.order : Number(item.order) || 0,
      carriedFrom: typeof item.carriedFrom === "string" ? item.carriedFrom : undefined,
      notes: typeof item.notes === "string" ? item.notes : undefined,
    };
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ week: string }> }): Promise<Response> {
  return api(async () => {
    const { week } = await ctx.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error("Invalid week — use YYYY-MM-DD");
    return readWeeklyPlan(week);
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ week: string }> }): Promise<Response> {
  return api(async () => {
    const { week } = await ctx.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new Error("Invalid week — use YYYY-MM-DD");
    const b = await readJson(req);
    return replaceWeeklyPlan(week, parseItems(b));
  });
}