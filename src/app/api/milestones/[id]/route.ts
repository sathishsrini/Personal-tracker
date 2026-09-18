import { api, num, readJson, str } from "@/lib/api/respond";
import { deleteMilestone, updateMilestone } from "@/lib/repo";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    return updateMilestone(id, {
      title: str(b, "title"),
      description: str(b, "description"),
      status: str(b, "status"),
      dueDate: str(b, "dueDate"),
      order: num(b, "order"),
    });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    await deleteMilestone(id);
    return { deleted: true };
  });
}
