import { api, readJson, str } from "@/lib/api/respond";
import { addLookupItem, type LookupTable } from "@/lib/repo";

const TABLES: LookupTable[] = ["Categories", "Priorities", "Statuses", "ActivityTags"];

function toTable(raw: string): LookupTable {
  const match = TABLES.find((t) => t.toLowerCase() === raw.toLowerCase());
  if (!match) throw new Error(`Unknown lookup table "${raw}" — must be one of: ${TABLES.join(", ")}`);
  return match;
}

/** POST /api/lookups/:table — add a new Category/Priority/Status/ActivityTag row. */
export async function POST(req: Request, ctx: { params: Promise<{ table: string }> }): Promise<Response> {
  return api(async () => {
    const { table } = await ctx.params;
    const b = await readJson(req);
    const values: Record<string, string> = { name: str(b, "name") ?? "" };
    if (b.color !== undefined) values.color = str(b, "color") ?? "";
    if (b.rank !== undefined) values.rank = String(b.rank);
    if (b.weight !== undefined) values.weight = String(b.weight);
    if (b.group !== undefined) values.group = str(b, "group") ?? "";
    if (b.order !== undefined) values.order = String(b.order);
    await addLookupItem(toTable(table), values);
    return { ok: true };
  }, 201);
}
