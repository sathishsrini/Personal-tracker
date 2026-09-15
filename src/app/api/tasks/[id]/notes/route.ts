import { api, readJson, str } from "@/lib/api/respond";
import { addNote } from "@/lib/repo";

const KINDS = ["progress", "completed", "remaining", "blocker", "clarification", "decision", "note"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    const kind = str(b, "kind") ?? "note";
    if (!KINDS.includes(kind)) throw new Error(`kind must be one of: ${KINDS.join(", ")}`);
    const message = str(b, "message");
    if (!message) throw new Error("message is required");
    await addNote({ taskId: id, kind: kind as "note", message });
    return { ok: true };
  });
}