// SGP4 propagator — production path.
//
// This module wraps the `sgp4` npm package (v1.0.10), a NodeJS port of
// the python-sgp4 library, which itself is based on the official
// Revisiting Spacetrack Report #3 SGP4 implementation by Vallado et al.
//
// References:
//   - npm: https://www.npmjs.com/package/sgp4
//   - source: https://github.com/joshuaferrara/node-sgp4
//   - algorithm paper: Vallado, Crawford, Hujsak, Kelso, "Revisiting Spacetrack Report #3"
//     https://celestrak.org/publications/AIAA/2006-6753/AIAA-2006-6753.pdf
//   - format documentation: https://celestrak.org/NORAD/documentation/gp-data-formats.php
//
// IMPORTANT — TEME vs ECI:
//   The SGP4 algorithm returns position and velocity in the TEME frame
//   (True Equator Mean Equinox), not J2000 ECI. For conjunction screening
//   (relative position/velocity between two objects propagated with the
//   same SGP4 model), the TEME frame is sufficient because both objects
//   are in the same frame. For visualization against Earth (latitude /
//   longitude overlay), we'd need TEME → ECEF conversion using GMST.
//   The `sgp4` package provides `eciToGeodetic` (which actually converts
//   TEME → geodetic using GMST).
//
// We do NOT use the legacy Keplerian/J2 propagator from `propagator.ts`
// for production work. That module is kept for the DEMO scenario only.
//
// Catalog ID support:
//   We call `sgp4init()` directly with orbital elements, bypassing the TLE
//   parser. This means we can handle 6+ digit catalog IDs without
//   truncation (per the modern CelesTrak GP documentation).

import SGP4 from 'sgp4';
import { OrbitalObject } from '@/lib/data/celestrak/types';
import { CartesianState } from './elements';
import type { PropagatedState } from './propagator';

export type { PropagatedState } from './propagator';

const TWO_PI = Math.PI * 2;
const DEG2RAD = Math.PI / 180;

export const SGP4_VERSION = 'sgp4 npm@1.0.10 (python-sgp4 port; WGS84)';
export const SGP4_FRAME = 'TEME (True Equator Mean Equinox)';

/** Cache of satrec objects keyed by a stable hash of orbital elements. */
interface SatrecCacheEntry {
  key: string;
  satrec: any;
  epoch: Date;
}
const satrecCache = new Map<string, SatrecCacheEntry>();

/**
 * Build a cache key from an OrbitalObject's elements + epoch.
 * Used to dedupe satrec construction for the same elements.
 */
function cacheKey(obj: OrbitalObject): string {
  return [
    obj.catalogId,
    obj.epoch,
    obj.meanMotion.toFixed(10),
    obj.eccentricity.toFixed(10),
    obj.inclination.toFixed(8),
    obj.raOfAscendingNode.toFixed(8),
    obj.argumentOfPerigee.toFixed(8),
    obj.meanAnomaly.toFixed(8),
    obj.bstar.toFixed(10),
  ].join('|');
}

/**
 * Convert an ISO 8601 UTC epoch to a Julian Date.
 * Uses the standard algorithm:
 *   JD = (UT1 days since J2000) + 2451545.0
 */
export function isoToJulianDate(iso: string): number {
  const d = new Date(iso);
  return dateToJulianDate(d);
}

/** Date → Julian Date (UT1, approximately UTC). */
export function dateToJulianDate(d: Date): number {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const second = d.getUTCSeconds() + d.getUTCMilliseconds() / 1000;
  // Standard algorithm:
  //   JD = 367*Y - floor(7*(Y+floor((M+9)/12))/4) - floor(3*(floor((Y+(M-9)/7)/100)+1)/4)
  //        + floor(275*M/9) + D + 1721028.5 + (h + min/60 + s/3600)/24
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  const frac = (hour - 12) / 24 + minute / 1440 + second / 86400;
  return jdn + frac;
}

/**
 * Build an SGP4 satrec object from an OrbitalObject's orbital elements.
 * Calls `sgp4init()` directly (bypasses the TLE parser, so it supports
 * 6+ digit catalog IDs without truncation).
 *
 * Returns a cached satrec if one was already built for these elements.
 *
 * IMPORTANT — epoch convention:
 *   The sgp4 npm package uses two epoch representations internally:
 *     - satrec.jdsatepoch = true Julian Date (~2460617 for 2026-08-19)
 *     - the `epoch` parameter passed to sgp4init = jdsatepoch - 2433281.5
 *       (days since 1949-12-31 12:00:00 UTC; the internal "ds50" epoch)
 *   Looking at twoline2rv() in node_modules/sgp4/sgp4.js line 1449:
 *     SGP4.sgp4init(gravconst, opsmode, satrec.satnum,
 *                   satrec.jdsatepoch-2433281.5, ...)
 *   So we must pass `jdsatepoch - 2433281.5` to sgp4init, and also set
 *   satrec.jdsatepoch so the propogate() function can compute the
 *   time-since-epoch correctly: m = (j_current - jdsatepoch) * 1440 min.
 */
export function buildSatrec(obj: OrbitalObject): any {
  const key = cacheKey(obj);
  const cached = satrecCache.get(key);
  if (cached) return cached.satrec;

  const satrec: any = {};
  // satn must be a number per the sgp4 package's API
  const satn = parseInt(obj.catalogId, 10);
  const epochJD = isoToJulianDate(obj.epoch);  // true Julian Date
  // sgp4init wants "days since 1949-12-31" (= jdsatepoch - 2433281.5)
  const ds50Epoch = epochJD - 2433281.5;

  // Convert from OMM units → sgp4init units:
  //   - mean motion: rev/day → rad/min (multiply by 2π/1440)
  //   - angles: deg → rad
  //   - eccentricity: dimensionless (no change)
  //   - bstar: dimensionless (no change)
  const xno = obj.meanMotion * TWO_PI / 1440;
  const xinclo = obj.inclination * DEG2RAD;
  const xnodeo = obj.raOfAscendingNode * DEG2RAD;
  const xargpo = obj.argumentOfPerigee * DEG2RAD;
  const xmo = obj.meanAnomaly * DEG2RAD;
  const xecco = obj.eccentricity;
  const xbstar = obj.bstar || 0;

  const gravconst = SGP4.wgs84();
  // opsmode 'a' = afspc, 'i' = improved. CelesTrak uses 'a' for GP.
  SGP4.sgp4init(gravconst, 'a', satn, ds50Epoch, xbstar, xecco, xargpo, xinclo, xmo, xno, xnodeo, satrec);

  // CRITICAL: satrec.jdsatepoch must be set so propogate() can compute
  // m = (j_current - jdsatepoch) * 1440 correctly.
  satrec.jdsatepoch = epochJD;
  satrec.error = satrec.error || 0;

  satrecCache.set(key, { key, satrec, epoch: new Date(obj.epoch) });
  return satrec;
}

/**
 * Propagate an OrbitalObject to a specific Date, returning a CartesianState
 * (position + velocity in km / km/s in the TEME frame).
 *
 * This is the production replacement for `propagate()` in `propagator.ts`.
 * The interface is identical so the conjunction engine works unchanged.
 *
 * Throws on propagation error (e.g., satellite has decayed).
 */
export function propagateSgp4(obj: OrbitalObject, t: Date): PropagatedState {
  const satrec = buildSatrec(obj);
  // Use the propogate() function which takes calendar dates directly
  // (Note: the sgp4 npm package spells it "propogate" — we keep their spelling.)
  const result = SGP4.propogate(
    satrec,
    t.getUTCFullYear(),
    t.getUTCMonth() + 1,
    t.getUTCDate(),
    t.getUTCHours(),
    t.getUTCMinutes(),
    t.getUTCSeconds() + t.getUTCMilliseconds() / 1000,
  );
  if (!result || result.position === false || result.velocity === false || !result.position || !result.velocity) {
    throw new Error(`SGP4 propagation failed for ${obj.name} (${obj.catalogId}) at ${t.toISOString()}: ${satrec.error_message ?? 'unknown error'}`);
  }
  const pos = result.position;
  const vel = result.velocity;
  // The sgp4 package returns {position: {x,y,z}, velocity: {x,y,z}} in km / km/s
  // but uses a slightly different shape. Convert to our CartesianState.
  const posObj = Array.isArray(pos) ? { x: pos[0], y: pos[1], z: pos[2] } : pos;
  const velObj = Array.isArray(vel) ? { x: vel[0], y: vel[1], z: vel[2] } : vel;

  // Build a fake "elements" property so the rest of the app (which expected it
  // from the old Keplerian propagator) doesn't crash.
  const a = 1 / (2 / Math.sqrt(posObj.x * posObj.x + posObj.y * posObj.y + posObj.z * posObj.z)
    - (velObj.x * velObj.x + velObj.y * velObj.y + velObj.z * velObj.z) / 398600.4418);
  return {
    x: posObj.x,
    y: posObj.y,
    z: posObj.z,
    vx: velObj.x,
    vy: velObj.y,
    vz: velObj.z,
    t,
    frame: 'TEME',
    elements: {
      a,
      e: obj.eccentricity,
      i: obj.inclination * DEG2RAD,
      raan: obj.raOfAscendingNode * DEG2RAD,
      omega: obj.argumentOfPerigee * DEG2RAD,
      nu: 0,  // not computed (the old Keplerian API returned true anomaly)
    },
  };
}

/**
 * Propagate over a time range at constant step (seconds).
 */
export function propagateRangeSgp4(
  obj: OrbitalObject,
  start: Date,
  end: Date,
  stepSec: number,
): PropagatedState[] {
  const out: PropagatedState[] = [];
  const startMs = start.getTime();
  const endMs = end.getTime();
  for (let ms = startMs; ms <= endMs; ms += stepSec * 1000) {
    out.push(propagateSgp4(obj, new Date(ms)));
  }
  return out;
}

/**
 * Get a single state vector at a timestamp.
 * Alias for propagateSgp4 (kept for clarity in the public API).
 */
export function getStateVector(obj: OrbitalObject, t: Date): PropagatedState {
  return propagateSgp4(obj, t);
}

/**
 * Clear the satrec cache (used when refreshing orbital data).
 */
export function clearSatrecCache(): void {
  satrecCache.clear();
}

/**
 * Compute the Greenwich Mean Sidereal Time for a given date.
 * Used to convert TEME → ECEF (geodetic lat/lon) for Earth-relative display.
 */
export function greenwichMeanSiderealTime(t: Date): number {
  return SGP4.gstimeFromDate(
    t.getUTCFullYear(),
    t.getUTCMonth() + 1,
    t.getUTCDate(),
    t.getUTCHours(),
    t.getUTCMinutes(),
    t.getUTCSeconds() + t.getUTCMilliseconds() / 1000,
  );
}

/**
 * Convert a TEME position to geodetic latitude/longitude/altitude.
 * Returns degrees + km altitude.
 */
export function temeToGeodetic(
  pos: { x: number; y: number; z: number },
  t: Date,
): { latitude: number; longitude: number; altitudeKm: number } {
  const gmst = greenwichMeanSiderealTime(t);
  const geo = SGP4.eciToGeodetic(pos, gmst);
  return {
    latitude: SGP4.degreesLat(geo.latitude),
    longitude: SGP4.degreesLong(geo.longitude),
    altitudeKm: geo.height,
  };
}
