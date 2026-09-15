import { api, readJson, str } from "@/lib/api/respond";
import { updateSettings } from "@/lib/repo";
import type { Settings } from "@/lib/types";

export async function PATCH(req: Request): Promise<Response> {
  return api(async () => {
    const b = await readJson(req);
    const patch: Partial<Settings> = {};
    if (b.workdayHours !== undefined) patch.workdayHours = Number(b.workdayHours);
    if (b.workdayStart !== undefined) patch.workdayStart = str(b, "workdayStart");
    if (b.workDays !== undefined) {
      const days = (Array.isArray(b.workDays) ? b.workDays : String(b.workDays).split(",")).map(Number);
      if (!days.every((d) => Number.isFinite(d) && d >= 0 && d <= 6)) throw new Error("workDays must be numbers 0-6");
      patch.workDays = days;
    }
    if (b.weekStartsOn !== undefined) patch.weekStartsOn = Number(b.weekStartsOn);
    if (b.timerMode !== undefined) {
      patch.timerMode = str(b, "timerMode") === "single" ? "single" : "concurrent";
    }
    if (b.concurrencyMode !== undefined) {
      patch.concurrencyMode = str(b, "concurrencyMode") === "full" ? "full" : "split";
    }
    if (b.maxTimerHours !== undefined) patch.maxTimerHours = Number(b.maxTimerHours);
    if (b.quadrantThreshold !== undefined) patch.quadrantThreshold = Number(b.quadrantThreshold);
    if (b.defaultTag !== undefined) patch.defaultTag = str(b, "defaultTag");
    if (b.defaultCategory !== undefined) patch.defaultCategory = str(b, "defaultCategory");
    if (b.defaultType !== undefined) patch.defaultType = str(b, "defaultType");
    return updateSettings(patch);
  });
}