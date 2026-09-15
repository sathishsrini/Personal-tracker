import { api, readJson, str } from "@/lib/api/respond";
import { deleteEntry, updateManualEntry } from "@/lib/repo";
import { parseTimestamp } from "@/lib/time";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    const toMs = (value: unknown): number | undefined => {
      if (value === undefined || value === null || value === "") return undefined;
      if (typeof value !== "string" && typeof value !== "number") throw new Error("checkIn/checkOut must be strings or numbers");
      const parsed = parseTimestamp(value);
      if (parsed === null) throw new Error("checkIn/checkOut must be valid timestamps");
      return parsed;
    };
    return updateManualEntry(id, {
      subtaskId: str(b, "subtaskId"),
      tag: str(b, "tag"),
      checkIn: toMs(b.checkIn),
      checkOut: b.checkOut === null ? null : toMs(b.checkOut),
      note: str(b, "note"),
    });
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    await deleteEntry(id);
    return { deleted: true };
  });
}