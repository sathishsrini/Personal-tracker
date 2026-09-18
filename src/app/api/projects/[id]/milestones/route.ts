import { api, num, readJson, str } from "@/lib/api/respond";
import { createMilestone } from "@/lib/repo";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    return createMilestone({
      projectId: id,
      title: str(b, "title") ?? "",
      description: str(b, "description"),
      status: str(b, "status"),
      dueDate: str(b, "dueDate"),
      order: num(b, "order"),
    });
  }, 201);
}
