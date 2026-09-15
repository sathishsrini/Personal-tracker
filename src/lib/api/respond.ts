import { NextResponse } from "next/server";

/**
 * Wraps a route handler so every endpoint shares the same JSON error shape
 * ({ error: string }) and maps thrown messages to sensible status codes.
 * Routes stay one-liners — no duplicated try/catch per endpoint.
 */
export async function api<T>(handler: () => Promise<T>, status = 200): Promise<Response> {
  try {
    return NextResponse.json(await handler(), { status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    let code = 500;
    if (/not found/i.test(message)) code = 404;
    else if (/required|must|invalid|overlap/i.test(message)) code = 400;
    else if (/queued|offline|network/i.test(message)) code = 503;
    return NextResponse.json({ error: message }, { status: code });
  }
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) throw new Error("JSON body must be an object");
    return body as Record<string, unknown>;
  } catch {
    throw new Error("Invalid JSON body");
  }
}

export function str(b: Record<string, unknown>, key: string): string | undefined {
  const v = b[key];
  return v === undefined || v === null ? undefined : String(v);
}

export function num(b: Record<string, unknown>, key: string): number | undefined {
  const v = b[key];
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number`);
  return n;
}