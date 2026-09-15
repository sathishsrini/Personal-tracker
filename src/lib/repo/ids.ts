/** Every id in the app is a UUID; works identically in Node (API routes) and the browser (optimistic ids/opIds). */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}
