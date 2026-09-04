// Normalizer: convert raw CelesTrakGPRecord → OrbitalObject (internal model).
//
// This module is the boundary between CelesTrak's JSON shape (UPPER_SNAKE_CASE
// field names matching the OMM/CCSDS standard) and our internal camelCase
// representation. It also computes derived quantities (semi-major axis,
// perigee, apogee, period) so the rest of the app doesn't need to redo them.

import {
  CelestrakGPRecord,
  OrbitalObject,
} from './types';
import { MU_EARTH, R_EARTH_KM } from '@/lib/orbital/elements';

const TWO_PI = Math.PI * 2;

/**
 * Compute a stable hash of the raw record for change detection.
 * Uses FNV-1a (32-bit) — not cryptographic, but stable and fast.
 */
export function hashRecord(rec: CelestrakGPRecord): string {
  // Sort keys for stable hash
  const keys = Object.keys(rec).sort();
  let h = 0x811c9dc5;
  for (const k of keys) {
    const v = rec[k as keyof CelestrakGPRecord];
    const s = `${k}=${v}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
  }
  // Pad to 16 hex chars for consistent display
  return h.toString(16).padStart(8, '0').repeat(2).slice(0, 16);
}

/**
 * Mean motion (rev/day) → semi-major axis (km).
 * From Kepler's third law: a = (μ / n²)^(1/3) where n is in rad/sec.
 */
export function meanMotionToSemiMajorAxis(meanMotionRevPerDay: number): number {
  const nRadPerSec = meanMotionRevPerDay * TWO_PI / 86400;
  return Math.cbrt(MU_EARTH / (nRadPerSec * nRadPerSec));
}

/**
 * Semi-major axis + eccentricity → perigee/apogee altitude (km, above Earth surface).
 * Note: this is the altitude above Earth's equatorial radius, not the geodetic
 * altitude above the surface. For screening visualization, this is sufficient.
 */
export function perigeeApogeeKm(aKm: number, e: number): { perigeeKm: number; apogeeKm: number } {
  const rPerigee = aKm * (1 - e);
  const rApogee = aKm * (1 + e);
  return { perigeeKm: rPerigee - R_EARTH_KM, apogeeKm: rApogee - R_EARTH_KM };
}

/**
 * Orbital period (minutes) from mean motion (rev/day).
 */
export function orbitalPeriodMin(meanMotionRevPerDay: number): number {
  if (meanMotionRevPerDay <= 0) return 0;
  return 1440 / meanMotionRevPerDay;
}

/**
 * Normalize the OBJECT_TYPE string from CelesTrak SATCAT into our enum.
 * CelesTrak uses 'PAYLOAD', 'ROCKET BODY', 'DEBRIS', 'UNKNOWN', 'SPECIAL'.
 * Our schema uses underscored values.
 */
export function normalizeObjectType(raw?: string): OrbitalObject['objectType'] {
  if (!raw) return 'UNKNOWN';
  const upper = raw.toUpperCase().trim();
  if (upper === 'PAYLOAD') return 'PAYLOAD';
  if (upper === 'ROCKET BODY' || upper === 'ROCKET_BODY') return 'ROCKET_BODY';
  if (upper === 'DEBRIS') return 'DEBRIS';
  if (upper === 'SPECIAL') return 'SPECIAL';
  return 'UNKNOWN';
}

/**
 * Convert one raw CelesTrak record to our internal OrbitalObject.
 * Never throws — missing optional fields are left undefined.
 */
export function normalizeRecord(rec: CelestrakGPRecord, source = 'CelesTrak'): OrbitalObject {
  const aKm = meanMotionToSemiMajorAxis(rec.MEAN_MOTION);
  const { perigeeKm, apogeeKm } = perigeeApogeeKm(aKm, rec.ECCENTRICITY);
  const period = orbitalPeriodMin(rec.MEAN_MOTION);

  return {
    catalogId: String(rec.NORAD_CAT_ID),  // string-safe: handles 6+ digit IDs
    name: rec.OBJECT_NAME,
    internationalDesignator: rec.OBJECT_ID,
    objectType: normalizeObjectType(rec.OBJECT_TYPE),
    operationalStatus: rec.OPERATIONAL_STATUS,
    epoch: rec.EPOCH,
    meanMotion: rec.MEAN_MOTION,
    eccentricity: rec.ECCENTRICITY,
    inclination: rec.INCLINATION,
    raOfAscendingNode: rec.RA_OF_ASC_NODE,
    argumentOfPerigee: rec.ARG_OF_PERICENTER,
    meanAnomaly: rec.MEAN_ANOMALY,
    bstar: rec.BSTAR ?? 0,
    revAtEpoch: rec.REV_AT_EPOCH,
    semiMajorAxisKm: aKm,
    perigeeKm,
    apogeeKm,
    orbitalPeriodMin: period,
    source,
    retrievedAt: new Date().toISOString(),
    format: 'OMM',  // JSON-encoded OMM per CCSDS 502.0-B-2
    rawDataHash: hashRecord(rec),
  };
}

/**
 * Normalize an array of records.
 */
export function normalizeRecords(recs: CelestrakGPRecord[], source = 'CelesTrak'): OrbitalObject[] {
  return recs.map(r => normalizeRecord(r, source));
}
