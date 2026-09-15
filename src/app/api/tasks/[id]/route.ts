import { api, num, readJson, str } from "@/lib/api/respond";
import { archiveTask, restoreTask, updateTask } from "@/lib/repo";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    return updateTask(id, {
      title: str(b, "title"),
      description: str(b, "description"),
      category: str(b, "category"),
      type: str(b, "type"),
      priority: str(b, "priority"),
      status: str(b, "status"),
      effort: num(b, "effort"),
      impact: num(b, "impact"),
      estimateMinutes: num(b, "estimateMinutes"),
      dueDate: str(b, "dueDate"),
      notes: str(b, "notes"),
      progress: num(b, "progress"),
    });
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    const permanent = str(b, "mode") === "permanent" || b.permanent === true;
    if (permanent) {
      const { deleteTaskPermanently } = await import("@/lib/repo");
      await deleteTaskPermanently(id);
      return { archived: true, permanent: true };
    }
    if (b.restore === true) {
      await restoreTask(id);
      return { archived: false };
    }
    await archiveTask(id);
    return { archived: true };
  });
}