import { api, readJson, str } from "@/lib/api/respond";
import { timerAction } from "@/lib/repo";
import type { TimerAction } from "@/lib/types";

const ACTIONS: TimerAction[] = ["start", "pause", "resume", "stop", "switch"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  return api(async () => {
    const { id } = await ctx.params;
    const b = await readJson(req);
    const action = str(b, "action") as TimerAction;
    if (!ACTIONS.includes(action)) throw new Error(`action must be one of: ${ACTIONS.join(", ")}`);
    return timerAction({
      taskId: id,
      action,
      opId: str(b, "opId"),
      tag: str(b, "tag"),
      subtaskId: str(b, "subtaskId"),
    });
  });
}