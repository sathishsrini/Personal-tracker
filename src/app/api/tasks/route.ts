import { api, num, readJson, str } from "@/lib/api/respond";
import { createTask } from "@/lib/repo";
import type { CreateTaskInput } from "@/lib/repo";

export async function POST(req: Request): Promise<Response> {
  return api(async () => {
    const b = await readJson(req);
    const input: CreateTaskInput = {
      title: str(b, "title") ?? "",
      description: str(b, "description"),
      category: str(b, "category"),
      type: str(b, "type"),
      priority: str(b, "priority"),
      status: str(b, "status"),
      effort: num(b, "effort") ?? null,
      impact: num(b, "impact") ?? null,
      estimateMinutes: num(b, "estimateMinutes") ?? null,
      dueDate: str(b, "dueDate"),
      notes: str(b, "notes"),
    };
    return createTask(input);
  }, 201);
}