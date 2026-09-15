import { api, readJson, str } from "@/lib/api/respond";
import { deactivateLookupItem, reactivateLookupItem, updateLookupItem, type LookupTable } from "@/lib/repo";

const TABLES: LookupTable[] = ["Categories", "Priorities", "Statuses", "ActivityTags"];

function toTable(raw: string): LookupTable {
  const match = TABLES.find((t) => t.toLowerCase() === raw.toLowerCase());
  if (!match) throw new Error(`Unknown lookup table "${raw}" — must be one of: ${TABLES.join(", ")}`);
  return match;
}

/** PATCH /api/lookups/:table/:name — edit color/rank/weight/group/order, or flip active. */
export async function PATCH(req: Request, ctx: { params: Promise<{ table: string; name: string }> }): Promise<Response> {
  return api(async () => {
    const { table, name } = await ctx.params;
    const b = await readJson(req);
    const patch: Record<string, string> = {};
    if (b.color !== undefined) patch.color = str(b, "color") ?? "";
    if (b.rank !== undefined) patch.rank = String(b.rank);
    if (b.weight !== undefined) patch.weight = String(b.weight);
    if (b.group !== undefined) patch.group = str(b, "group") ?? "";
    if (b.order !== undefined) patch.order = String(b.order);
    if (b.active !== undefined) patch.active = b.active ? "true" : "false";
    await updateLookupItem(toTable(table), decodeURIComponent(name), patch);
    return { ok: true };
  });
}

/** DELETE /api/lookups/:table/:name — deactivates (never removes: task rows may already reference this name). */
export async function DELETE(req: Request, ctx: { params: Promise<{ table: string; name: string }> }): Promise<Response> {
  return api(async () => {
    const { table, name } = await ctx.params;
    const b = await readJson(req).catch(() => ({}) as Record<string, unknown>);
    const decoded = decodeURIComponent(name);
    if (b.restore === true) {
      await reactivateLookupItem(toTable(table), decoded);
      return { active: true };
    }
    await deactivateLookupItem(toTable(table), decoded);
    return { active: false };
  });
}
