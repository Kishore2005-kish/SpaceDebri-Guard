// Parser for CelesTrak GP/OMM data.
//
// CelesTrak's JSON endpoints return raw JSON when fetched directly. When
// fetched through the z-ai-web-dev-sdk `page_reader` function, the JSON is
// wrapped in a minimal HTML page like:
//
//   <html><head><meta name="color-scheme" content="light dark"></head>
//   <body><pre style="...">[{"OBJECT_NAME":"ISS (ZARYA)",...}]</pre></body></html>
//
// This module extracts the JSON from that HTML wrapper and parses it into
// CelestrakGPRecord[] objects. It validates each record and rejects invalid
// ones (with a recorded parse error), never throwing on a single bad record.
//
// References:
//   - https://celestrak.org/NORAD/documentation/gp-data-formats.php
//   - CCSDS 502.0-B-2 (OMM standard)

import { CelestrakGPRecord } from './types';

export interface ParseResult {
  records: CelestrakGPRecord[];
  rejected: number;
  errors: string[];
}

/**
 * Extract the JSON payload from a CelesTrak HTML-wrapped response.
 * Returns the raw JSON string, or null if not found.
 */
export function extractJsonFromHtml(html: string): string | null {
  // The SDK wraps JSON in <pre>...</pre>. Find the <pre> tag content.
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (preMatch && preMatch[1]) {
    return preMatch[1].trim();
  }
  // Fall back: maybe the response is already JSON (starts with [ or {)
  const trimmed = html.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return trimmed;
  }
  // Fall back: try to find JSON array/object anywhere
  const arrMatch = html.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrMatch) return arrMatch[0];
  return null;
}

/**
 * Parse a single CelesTrak GP/OMM JSON record and validate required fields.
 * Returns null and pushes to errors[] if invalid.
 */
function validateRecord(raw: any, idx: number, errors: string[]): CelestrakGPRecord | null {
  if (!raw || typeof raw !== 'object') {
    errors.push(`Record ${idx}: not an object`);
    return null;
  }
  // Required fields per CCSDS OMM + CelesTrak JSON
  const required: (keyof CelestrakGPRecord)[] = [
    'OBJECT_NAME', 'EPOCH', 'MEAN_MOTION', 'ECCENTRICITY',
    'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY',
    'NORAD_CAT_ID',
  ];
  for (const k of required) {
    if (raw[k] === undefined || raw[k] === null) {
      errors.push(`Record ${idx} (${raw.OBJECT_NAME ?? '?'}): missing ${k}`);
      return null;
    }
  }
  // NORAD_CAT_ID can be 6+ digits (modern catalog). Keep as number; convert
  // to string at the boundary (normalizer). Do NOT truncate to 5 digits.
  // Validate epoch is parseable.
  const epochMs = Date.parse(raw.EPOCH);
  if (isNaN(epochMs)) {
    errors.push(`Record ${idx} (${raw.OBJECT_NAME}): invalid EPOCH "${raw.EPOCH}"`);
    return null;
  }
  // Validate numeric fields are finite
  const numeric: (keyof CelestrakGPRecord)[] = [
    'MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE',
    'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'NORAD_CAT_ID',
  ];
  for (const k of numeric) {
    if (typeof raw[k] !== 'number' || !isFinite(raw[k] as number)) {
      errors.push(`Record ${idx} (${raw.OBJECT_NAME}): ${k} not finite (${raw[k]})`);
      return null;
    }
  }
  // Eccentricity must be in [0, 1)
  if (raw.ECCENTRICITY < 0 || raw.ECCENTRICITY >= 1) {
    errors.push(`Record ${idx} (${raw.OBJECT_NAME}): eccentricity out of range ${raw.ECCENTRICITY}`);
    return null;
  }
  return raw as CelestrakGPRecord;
}

/**
 * Parse the JSON payload (string) into validated CelestrakGPRecord[].
 */
export function parseJsonPayload(jsonStr: string): ParseResult {
  const errors: string[] = [];
  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e: any) {
    errors.push(`JSON.parse failed: ${e.message}`);
    return { records: [], rejected: 0, errors };
  }
  // CelesTrak returns an array of records
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const records: CelestrakGPRecord[] = [];
  let rejected = 0;
  arr.forEach((raw, idx) => {
    const rec = validateRecord(raw, idx, errors);
    if (rec) {
      records.push(rec);
    } else {
      rejected++;
    }
  });
  return { records, rejected, errors };
}

/**
 * Convenience: extract + parse in one call.
 */
export function parseCelesTrakHtml(html: string): ParseResult {
  const jsonStr = extractJsonFromHtml(html);
  if (!jsonStr) {
    return {
      records: [],
      rejected: 0,
      errors: ['No <pre> JSON payload found in HTML response'],
    };
  }
  return parseJsonPayload(jsonStr);
}
