import { api, readJson, str } from "@/lib/api/respond";
import { createProject } from "@/lib/repo";
import type { CreateProjectInput } from "@/lib/repo";

export async function POST(req: Request): Promise<Response> {
  return api(async () => {
    const b = await readJson(req);
    const input: CreateProjectInput = {
      name: str(b, "name") ?? "",
      description: str(b, "description"),
      color: str(b, "color"),
      status: str(b, "status"),
      startDate: str(b, "startDate"),
      targetDate: str(b, "targetDate"),
    };
    return createProject(input);
  }, 201);
}
