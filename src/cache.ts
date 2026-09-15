// Tiny TTL cache with in-flight request coalescing. Enough for a
// single-user local server; Cloudflare KV replaces it on Workers.

type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 1000;

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const ongoing = inflight.get(key);
  if (ongoing) return ongoing as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  const value = await p;
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  store.set(key, { value, expires: now + ttlMs });
  return value;
}

export const MIN = 60_000;
export const HOUR = 3_600_000;

export function cachedGet<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  return undefined;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (!oldest.done) store.delete(oldest.value);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}
