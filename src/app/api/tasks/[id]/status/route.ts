import { api, readJson, str } from "@/lib/api/respond";
import { updateTask } from "@/lib/repo";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    const status = str(b, "status");
    if (!status) throw new Error("status is required");
    return updateTask(id, { status });
  });
}