/** Tiny localStorage-backed outbox. Timer ops that fail while offline are
 *  parked here in submission order and replayed when connectivity returns.
 *  Every stored op carries its idempotency opId, so a replay can never
 *  create a duplicate timer entry. Storage-only — replay lives in api.ts. */

export interface QueuedOp {
  id: string;
  route: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** submission order */
  seq: number;
  t: number;
}

const KEY = "tracker.ops.v1";

function read(): QueuedOp[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedOp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(ops: QueuedOp[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ops));
  } catch {
    // Storage full/blocked — drop the queue rather than wedge the app.
  }
}

let seq = 0;
let listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function queuedCount(): number {
  return read().length;
}

export function enqueueOp(op: Omit<QueuedOp, "seq" | "t">): QueuedOp {
  const ops = read();
  if (ops.some((o) => o.id === op.id)) return ops.find((o) => o.id === op.id)!;
  const full: QueuedOp = { ...op, seq: seq++, t: Date.now() };
  ops.push(full);
  write(ops);
  emit();
  return full;
}

export function dropOp(id: string): void {
  write(read().filter((o) => o.id !== id));
  emit();
}

export function queueSnapshot(): QueuedOp[] {
  return read();
}