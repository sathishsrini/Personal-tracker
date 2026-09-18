import { api, num, readJson, str } from "@/lib/api/respond";
import { archiveProject, deleteProjectPermanently, restoreProject, updateProject } from "@/lib/repo";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    return updateProject(id, {
      name: str(b, "name"),
      description: str(b, "description"),
      color: str(b, "color"),
      status: str(b, "status"),
      startDate: str(b, "startDate"),
      targetDate: str(b, "targetDate"),
      order: num(b, "order"),
    });
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    if (str(b, "mode") === "permanent" || b.permanent === true) {
      await deleteProjectPermanently(id);
      return { archived: true, permanent: true };
    }
    if (b.restore === true) {
      await restoreProject(id);
      return { archived: false };
    }
    await archiveProject(id);
    return { archived: true };
  });
}
