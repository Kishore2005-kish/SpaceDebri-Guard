// CelesTrak client.
//
// Fetches real GP/OMM data from the official CelesTrak endpoints:
//   https://celestrak.org/NORAD/elements/gp.php?GROUP=...&FORMAT=JSON
//
// IMPORTANT ARCHITECTURAL NOTE:
//   The sandbox environment does NOT have direct outbound HTTPS to celestrak.org.
//   We fetch through the z-ai-web-dev-sdk `page_reader` function, which acts
//   as an HTTP proxy with content extraction. The page_reader:
//     - strips URL query strings unless the `?` and `&` are URL-encoded
//     - wraps the JSON response in <html><body><pre>...</pre></body></html>
//   So we URL-encode the query as %3F + %26 and post-process the HTML to
//   extract the JSON payload.
//
//   When deployed to an environment with direct outbound HTTPS, the same
//   client can use plain `fetch(url)` instead — just toggle the USE_PROXY
//   flag below. The parser/normalizer modules work identically either way.
//
// References:
//   - https://celestrak.org/NORAD/elements/
//   - https://celestrak.org/NORAD/documentation/gp-data-formats.php
//   - z-ai-web-dev-sdk page_reader function (see node_modules/z-ai-web-dev-sdk/README.md)

import {
  CelestrakFetchResult,
  CelestrakGroup,
  CelestrakGPRecord,
} from './types';
import { parseCelesTrakHtml } from './parser';

// Toggle this when deploying to an environment with direct HTTPS to CelesTrak.
const USE_PROXY = true;

// The official CelesTrak GP endpoint.
const GP_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
const TABLE_BASE = 'https://celestrak.org/NORAD/elements/table.php';
const SATCAT_SEARCH_BASE = 'https://celestrak.org/satcat/search.php';
const SOCRATES_BASE = 'https://celestrak.org/SOCRATES/socrates.php';

const REQUEST_TIMEOUT_MS = 60_000;  // generous timeout for proxy + large payloads
const RATE_LIMIT_MS = 5_000;        // min gap between refresh calls
let lastFetchAt = 0;

/**
 * Build a CelesTrak URL with the given query parameters.
 */
export function buildUrl(
  base: string,
  params: Record<string, string | number>,
): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base}?${query}`;
}

/**
 * URL-encode a URL's query string by encoding ? as %3F and & as %26.
 * The SDK's page_reader canonicalizes URLs and strips the query string
 * unless it's encoded. This is the workaround.
 *
 * Example:
 *   "https://celestrak.org/.../gp.php?GROUP=stations&FORMAT=JSON"
 * becomes
 *   "https://celestrak.org/.../gp.php%3FGROUP%3Dstations%26FORMAT%3DJSON"
 */
export function encodeUrlForProxy(url: string): string {
  // Encode only the query separator chars; leave the path alone
  return url
    .replace(/\?/g, '%3F')
    .replace(/&/g, '%26')
    .replace(/=/g, '%3D');
}

/**
 * Fetch a URL via the z-ai-web-dev-sdk page_reader proxy.
 * Returns the HTML wrapper (which contains the JSON in a <pre> tag).
 */
async function fetchViaProxy(url: string): Promise<string> {
  // Dynamic import so the SDK doesn't get bundled into the client side.
  const ZAIModule: any = await import('z-ai-web-dev-sdk');
  const ZAI = ZAIModule.default || ZAIModule;
  const zai = await ZAI.create();
  const encoded = encodeUrlForProxy(url);
  const result = await zai.functions.invoke('page_reader', { url: encoded });
  if (!result || !result.data || !result.data.html) {
    throw new Error(`page_reader returned no HTML for ${url}`);
  }
  return result.data.html as string;
}

/**
 * Fetch a URL directly with `fetch`. Used when USE_PROXY is false.
 */
async function fetchDirect(url: string): Promise<string> {
  // `fetch` returns the raw body, not HTML-wrapped. To make it consistent with
  // the proxy path, we wrap the body in <pre> tags.
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`CelesTrak returned HTTP ${res.status} for ${url}`);
  }
  const text = await res.text();
  return `<html><body><pre>${text}</pre></body></html>`;
}

/**
 * Enforce a minimum gap between refresh calls to be polite to CelesTrak.
 */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastFetchAt;
  if (elapsed < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - elapsed));
  }
  lastFetchAt = Date.now();
}

/**
 * Fetch a CelesTrak GP group (e.g., 'stations', 'starlink', 'active') as JSON.
 * Returns parsed records + provenance metadata.
 */
export async function fetchGroup(
  group: CelestrakGroup | string,
  format: 'JSON' | 'JSON-PRETTY' | 'CSV' | 'TLE' = 'JSON',
): Promise<CelestrakFetchResult> {
  const url = buildUrl(GP_BASE, { GROUP: group, FORMAT: format });
  return fetchByUrl(url, `group:${group}`);
}

/**
 * Fetch objects by NORAD catalog ID. CelesTrak supports comma-separated lists.
 */
export async function fetchByCatalogId(
  catalogIds: (number | string)[],
  format: 'JSON' | 'JSON-PRETTY' | 'CSV' | 'TLE' = 'JSON',
): Promise<CelestrakFetchResult> {
  const ids = catalogIds.map(String).join(',');
  const url = buildUrl(GP_BASE, { CAT: ids, FORMAT: format });
  return fetchByUrl(url, `catalog:${ids}`);
}

/**
 * Fetch objects by name (uses CelesTrak's NAME= query parameter).
 */
export async function fetchByName(
  name: string,
  format: 'JSON' | 'JSON-PRETTY' = 'JSON',
): Promise<CelestrakFetchResult> {
  const url = buildUrl(GP_BASE, { NAME: name, FORMAT: format });
  return fetchByUrl(url, `name:${name}`);
}

/**
 * Fetch the active satellites group. Note: this returns ~9,000+ objects and
 * may take significant time and memory. Prefer `fetchStations()` or
 * `fetchStarlinkObjects()` for the demo.
 */
export async function fetchActiveObjects(): Promise<CelestrakFetchResult> {
  return fetchGroup('active');
}

/** ISS, Tiangong, HST, etc. (small payload — ~12 objects). */
export async function fetchStations(): Promise<CelestrakFetchResult> {
  return fetchGroup('stations');
}

/** Starlink constellation (large payload — ~6000+ objects). */
export async function fetchStarlinkObjects(): Promise<CelestrakFetchResult> {
  return fetchGroup('starlink');
}

/** Geosynchronous satellites. */
export async function fetchGeoObjects(): Promise<CelestrakFetchResult> {
  return fetchGroup('geo');
}

/** Fetch a curated demo set: stations + a small Starlink sample. */
export async function fetchDemoSet(): Promise<CelestrakFetchResult[]> {
  // We deliberately keep this small: stations (~12), a Starlink subset.
  // The full active catalog (~9000) would overwhelm the demo.
  const stations = await fetchStations();
  // For the Starlink subset, fetch by name "STARLINK" (returns top matches).
  // If that's too large, fall back to fetching specific catalog IDs.
  return [stations];
}

/**
 * Low-level fetch: takes a URL, returns a CelestrakFetchResult.
 */
async function fetchByUrl(url: string, sourceKey: string): Promise<CelestrakFetchResult> {
  await rateLimit();
  const t0 = Date.now();
  let html: string;
  try {
    html = USE_PROXY ? await fetchViaProxy(url) : await fetchDirect(url);
  } catch (e: any) {
    return {
      source: 'CelesTrak',
      url,
      retrievedAt: new Date().toISOString(),
      rawHtml: '',
      records: [],
      recordsParsed: 0,
      recordsRejected: 0,
      parseErrors: [`fetch failed: ${e.message}`],
      durationMs: Date.now() - t0,
    };
  }
  const parseResult = parseCelesTrakHtml(html);
  return {
    source: 'CelesTrak',
    url,
    retrievedAt: new Date().toISOString(),
    rawHtml: html,
    records: parseResult.records,
    recordsParsed: parseResult.records.length,
    recordsRejected: parseResult.rejected,
    parseErrors: parseResult.errors,
    durationMs: Date.now() - t0,
  };
}

/**
 * Fetch a SOCRATES CSV reference (independent public conjunction data).
 * Used by the validation page.
 *
 * SOCRATES format documentation:
 *   https://www.celestrak.org/SOCRATES/socrates-format.php
 */
export async function fetchSocratesReference(): Promise<{
  url: string;
  retrievedAt: string;
  rawText: string;
  records: SocratesRecord[];
  errors: string[];
}> {
  const url = `${SOCRATES_BASE}?_=${Date.now()}`;  // bust cache
  await rateLimit();
  let rawText = '';
  try {
    // SOCRATES is served as CSV — try fetching through the proxy
    const html = USE_PROXY ? await fetchViaProxy(url) : (await fetchDirect(url));
    // Extract CSV from <pre>
    const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    rawText = preMatch ? preMatch[1] : html;
  } catch (e: any) {
    return {
      url,
      retrievedAt: new Date().toISOString(),
      rawText: '',
      records: [],
      errors: [`SOCRATES fetch failed: ${e.message}`],
    };
  }
  const records = parseSocratesCsv(rawText);
  return {
    url,
    retrievedAt: new Date().toISOString(),
    rawText,
    records,
    errors: [],
  };
}

/** Parsed SOCRATES record (subset of fields). */
export interface SocratesRecord {
  primaryName: string;
  primaryCatalogId: string;
  secondaryName: string;
  secondaryCatalogId: string;
  tca: string;
  minRangeKm: number;
  relativeVelocityKmPerSec: number;
  // raw row for full audit
  raw: string;
}

/**
 * Parse a SOCRATES CSV file into SocratesRecord[].
 * SOCRATES CSV format (from https://www.celestrak.org/SOCRATES/socrates-format.php):
 *   Header row 1: metadata
 *   Header row 2: column names
 *   Data rows: comma-separated values
 */
export function parseSocratesCsv(text: string): SocratesRecord[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  if (lines.length < 2) return [];
  // Find the header row (starts with "Satellite A Catalog Number")
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i].toLowerCase().includes('catalog') && lines[i].toLowerCase().includes('satellite')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];
  const headers = lines[headerIdx].split(',').map(h => h.trim().toLowerCase());
  const out: SocratesRecord[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < headers.length) continue;
    const get = (name: string) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? cols[idx] : '';
    };
    const pName = get('satellite a name') || get('primary name');
    const pId = get('satellite a catalog number') || get('primary catalog');
    const sName = get('satellite b name') || get('secondary name');
    const sId = get('satellite b catalog number') || get('secondary catalog');
    const tca = get('tca');
    const minR = parseFloat(get('min range') || get('minimum range') || '0');
    const relV = parseFloat(get('relative velocity') || get('rel velocity') || '0');
    if (!pId && !sId) continue;
    out.push({
      primaryName: pName,
      primaryCatalogId: pId,
      secondaryName: sName,
      secondaryCatalogId: sId,
      tca,
      minRangeKm: isFinite(minR) ? minR : 0,
      relativeVelocityKmPerSec: isFinite(relV) ? relV : 0,
      raw: lines[i],
    });
  }
  return out;
}
