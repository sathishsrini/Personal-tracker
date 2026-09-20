import { api, num, readJson, str } from "@/lib/api/respond";
import { createSubtask } from "@/lib/repo";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    const title = str(b, "title");
    if (!title) throw new Error("Subtask title is required");
    return createSubtask({ taskId: id, title, weight: num(b, "weight") ?? null, estimateMinutes: num(b, "estimateMinutes") ?? null, order: num(b, "order") });
  }, 201);
}