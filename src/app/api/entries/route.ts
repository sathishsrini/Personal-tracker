import { api, readJson, str } from "@/lib/api/respond";
import { createManualEntry } from "@/lib/repo";
import { parseTimestamp } from "@/lib/time";

function ts(value: unknown, key: string): number {
  if (value === null || value === undefined || value === "") throw new Error(`${key} is required`);
  if (typeof value !== "string" && typeof value !== "number") throw new Error(`${key} must be a string or number`);
  const parsed = parseTimestamp(value);
  if (parsed === null) throw new Error(`${key} must be a valid timestamp`);
  return parsed;
}

export async function POST(req: Request): Promise<Response> {
  return api(async () => {
    const b = await readJson(req);
    const taskId = str(b, "taskId");
    if (!taskId) throw new Error("taskId is required");
    return createManualEntry({
      taskId,
      subtaskId: str(b, "subtaskId"),
      tag: str(b, "tag"),
      checkIn: ts(b.checkIn, "checkIn"),
      checkOut: b.checkOut === null || b.checkOut === undefined ? null : ts(b.checkOut, "checkOut"),
      note: str(b, "note"),
    });
  }, 201);
}