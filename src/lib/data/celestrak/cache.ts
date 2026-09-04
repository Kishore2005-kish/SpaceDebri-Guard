// In-memory cache for CelesTrak fetch results.
//
// Why a cache:
//   CelesTrak requests should be polite — we don't want to hammer their
//   servers on every page render. We cache successful fetch results for
//   CACHE_TTL_MS (default 15 minutes). Failed fetches are not cached.
//
// Note: this is an in-memory cache only. For persistence, the normalized
// objects are upserted into the Prisma database by the services layer.

import { CacheEntry, CelestrakGPRecord } from './types';

const CACHE_TTL_MS = 15 * 60 * 1000;  // 15 minutes
const cache = new Map<string, CacheEntry>();

export function getCached(key: string): CelestrakGPRecord[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ageMs = Date.now() - new Date(entry.fetchedAt).getTime();
  if (ageMs > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.records;
}

export function setCached(
  key: string,
  records: CelestrakGPRecord[],
  source: string,
  url: string,
): void {
  cache.set(key, {
    key,
    records,
    fetchedAt: new Date().toISOString(),
    source,
    url,
  });
}

export function getCacheAgeMs(key: string): number | null {
  const entry = cache.get(key);
  if (!entry) return null;
  return Date.now() - new Date(entry.fetchedAt).getTime();
}

export function clearCache(): void {
  cache.clear();
}

export function listCacheEntries(): CacheEntry[] {
  return Array.from(cache.values());
}
