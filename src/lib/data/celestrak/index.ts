// Public API for the CelesTrak data provider.
//
// Usage (server-side only — the z-ai-web-dev-sdk SDK is server-only):
//   import { fetchRealCatalog, fetchStations } from '@/lib/data/celestrak';
//
// The client wraps the SDK's page_reader proxy (URL-encoded query workaround)
// and the parser + normalizer. Results are cached for 15 minutes to avoid
// hammering CelesTrak on every request.

export * from './types';
export * from './client';
export * from './parser';
export * from './normalizer';
export * from './cache';

import { fetchGroup, fetchByCatalogId, fetchByName, fetchStations, fetchStarlinkObjects, fetchActiveObjects, fetchSocratesReference } from './client';
import { normalizeRecords } from './normalizer';
import { getCached, setCached } from './cache';
import { OrbitalObject } from './types';

/**
 * Fetch + normalize + cache a CelesTrak group. Returns OrbitalObject[].
 * This is the main entry point used by the services layer.
 */
export async function fetchRealCatalog(group: string = 'stations'): Promise<{
  objects: OrbitalObject[];
  source: string;
  retrievedAt: string;
  url: string;
  recordsParsed: number;
  recordsRejected: number;
  parseErrors: string[];
  durationMs: number;
}> {
  const cacheKey = `group:${group}`;
  const cached = getCached(cacheKey);
  if (cached) {
    const objects = normalizeRecords(cached);
    return {
      objects,
      source: 'CelesTrak (cached)',
      retrievedAt: new Date().toISOString(),
      url: '',
      recordsParsed: objects.length,
      recordsRejected: 0,
      parseErrors: [],
      durationMs: 0,
    };
  }
  const result = await fetchGroup(group);
  setCached(cacheKey, result.records, result.source, result.url);
  const objects = normalizeRecords(result.records);
  return {
    objects,
    source: result.source,
    retrievedAt: result.retrievedAt,
    url: result.url,
    recordsParsed: result.recordsParsed,
    recordsRejected: result.recordsRejected,
    parseErrors: result.parseErrors,
    durationMs: result.durationMs,
  };
}

/**
 * Fetch + normalize a specific catalog ID. Useful for "search by NORAD ID".
 */
export async function fetchObjectByCatalogId(catalogId: number | string): Promise<OrbitalObject | null> {
  const result = await fetchByCatalogId([catalogId]);
  if (result.records.length === 0) return null;
  return normalizeRecords(result.records)[0];
}

/**
 * Fetch + normalize objects by name (CelesTrak NAME= query).
 */
export async function fetchObjectsByName(name: string): Promise<OrbitalObject[]> {
  const result = await fetchByName(name);
  return normalizeRecords(result.records);
}

/** Convenience: ISS + Tiangong + HST etc. */
export { fetchStations, fetchStarlinkObjects, fetchActiveObjects, fetchSocratesReference };
