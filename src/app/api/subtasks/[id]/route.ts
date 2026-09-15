import { api, num, readJson, str } from "@/lib/api/respond";
import { deleteSubtask, updateSubtask } from "@/lib/repo";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    return updateSubtask(id, {
      title: str(b, "title"),
      status: str(b, "status"),
      estimateMinutes: num(b, "estimateMinutes"),
      order: num(b, "order"),
      notes: str(b, "notes"),
    });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    await deleteSubtask(id);
    return { deleted: true };
  });
}