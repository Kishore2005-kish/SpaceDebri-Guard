// Types for CelesTrak GP (General Perturbations) data.
//
// These types model the JSON OMM (Orbit Mean-Elements Message) format documented at:
//   https://celestrak.org/NORAD/documentation/gp-data-formats.php
//
// Per the official documentation:
//   "The OMM is the recommended format for storing and exchanging GP data."
//   "OMM uses key-value pairs (KVN) or JSON; both encode the same fields."
//   "Legacy TLE cannot represent 6-digit catalog numbers; OMM/JSON/CSV can."
//
// We deliberately keep the raw JSON shape from CelesTrak so we can store and
// re-validate it exactly as received. We then normalize into our internal
// OrbitalObject model in `normalizer.ts`.

/**
 * Raw CelesTrak GP/OMM JSON record (one per object).
 * Field names match CelesTrak's JSON output verbatim.
 */
export interface CelestrakGPRecord {
  OBJECT_NAME: string;
  OBJECT_ID?: string;            // international designator e.g. "1998-067A"
  EPOCH: string;                  // ISO 8601 UTC
  MEAN_MOTION: number;            // rev/day
  ECCENTRICITY: number;           // dimensionless
  INCLINATION: number;            // deg
  RA_OF_ASC_NODE: number;         // deg
  ARG_OF_PERICENTER: number;     // deg
  MEAN_ANOMALY: number;          // deg
  EPHEMERIS_TYPE?: number;       // 0 = standard
  CLASSIFICATION_TYPE?: string; // U = unclassified
  NORAD_CAT_ID: number;          // integer — may be 6+ digits
  ELEMENT_SET_NO?: number;
  REV_AT_EPOCH?: number;
  BSTAR?: number;                // drag term (~1e-4 typical)
  MEAN_MOTION_DOT?: number;      // rev/day² (first derivative)
  MEAN_MOTION_DDOT?: number;     // rev/day³ (second derivative)
  // Optional SATCAT metadata (when fetched from satcat table)
  OBJECT_TYPE?: string;          // 'PAYLOAD' | 'ROCKET BODY' | 'DEBRIS' | 'UNKNOWN' | 'SPECIAL'
  OPERATIONAL_STATUS?: string;  // '+', '-', 'P', 'B', 'S', 'X', 'D', '?'
  RCS_SIZE?: string;             // 'LARGE' | 'MEDIUM' | 'SMALL' | ''
  LAUNCH_DATE?: string;
  DECAY_DATE?: string;
  COUNTRY?: string;
  LAUNCH_NUM?: number;
  LAUNCH_PIECE?: string;
}

/** Result of a CelesTrak fetch operation. */
export interface CelestrakFetchResult {
  source: 'CelesTrak';
  url: string;
  retrievedAt: string;            // ISO 8601 UTC
  rawHtml: string;                // raw HTML wrapper returned by the SDK
  records: CelestrakGPRecord[];   // parsed JSON records
  recordsParsed: number;
  recordsRejected: number;
  parseErrors: string[];
  durationMs: number;
}

/**
 * Normalized internal representation of a catalog object.
 * This is the canonical shape used throughout the application.
 */
export interface OrbitalObject {
  catalogId: string;              // string-safe (handles 6+ digit IDs)
  name: string;
  internationalDesignator?: string;
  objectType: 'PAYLOAD' | 'ROCKET_BODY' | 'DEBRIS' | 'UNKNOWN' | 'SPECIAL';
  operationalStatus?: string;

  epoch: string;                  // ISO 8601 UTC

  meanMotion: number;             // rev/day
  eccentricity: number;
  inclination: number;            // deg
  raOfAscendingNode: number;      // deg
  argumentOfPerigee: number;      // deg
  meanAnomaly: number;            // deg
  bstar: number;                  // drag term
  revAtEpoch?: number;

  // Derived (computed from elements)
  semiMajorAxisKm?: number;
  perigeeKm?: number;
  apogeeKm?: number;
  orbitalPeriodMin?: number;

  source: string;                 // 'CelesTrak' | 'SENTINEL-DEMO'
  retrievedAt: string;
  format: 'OMM' | 'TLE' | 'JSON' | 'CSV';

  rawDataHash: string;            // sha-like hash for change detection
}

/** A snapshot of the catalog at a moment in time. */
export interface CatalogSnapshot {
  id: string;                     // e.g. 'CT-2026-08-19-1432'
  source: string;
  retrievedAt: string;
  objectCount: number;
  createdAt: string;
  notes?: string;
}

/** Supported CelesTrak groups (subset — extend as needed). */
export type CelestrakGroup =
  | 'active'      // active satellites (~9000+)
  | 'stations'    // ISS, Tiangong, etc.
  | 'starlink'   // Starlink constellation
  | 'geo'        // geosynchronous
  | 'tle-new'    // newly released TLEs
  | 'cosmos'     // Cosmos 1408 debris
  | 'iridium-33-debris'
  | 'cosmos-2251-debris'
  | '1999-025-debris'
  | 'sl-8-debris' // Soyuz rocket bodies
  | '1982-093-debris';

/** Internal cache entry. */
export interface CacheEntry {
  key: string;
  records: CelestrakGPRecord[];
  fetchedAt: string;
  source: string;
  url: string;
}
