// Tiny in-memory cache for the read-heavy static endpoints
// (/business, /services, /stylists). Invalidated on admin writes.

type Entry = { value: unknown; expires: number };

const store = new Map<string, Entry>();

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (e.expires < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs = 60_000): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

/** Drop every cache entry for a company (called on admin writes). */
export function cacheInvalidateCompany(companyId: string): void {
  for (const key of store.keys()) {
    if (key.includes(`:${companyId}`)) store.delete(key);
  }
}
