// Conjunction screening engine — production path with SGP4.
//
// This is the upgraded version of the conjunction engine. It uses the
// real SGP4 propagator (`propagateSgp4` from `./sgp4`) and works with
// the new `OrbitalObject` model (which supports 6+ digit catalog IDs).
//
// Algorithm (coarse-to-fine with analytical TCA refinement):
//
//   1. COARSE PASS: Sample primary and secondary every COARSE_STEP_SEC
//      seconds (60s) over the screening horizon. Identify local minima
//      below COARSE_THRESHOLD (a generous threshold, e.g. 600 km —
//      worst case 30s away × 10 km/s × 2 ≈ 600 km). This catches ALL
//      candidate close approaches, even sub-second ones.
//
//   2. FINE PASS: For each coarse candidate, do a 1-second-step search
//      in a ±10-minute window around the coarse min. Find the best
//      1-second sample.
//
//   3. ANALYTICAL TCA REFINEMENT: At the 1-second fine min, we have
//      relative position r_rel and relative velocity v_rel. Assuming
//      v_rel is approximately constant over the short encounter window
//      (which is exact for two-body motion, very accurate for short
//      encounters), the true minimum is at:
//
//        t* = t_fine - (r_rel · v_rel) / |v_rel|²
//
//      and the true minimum range is:
//
//        d* = sqrt(|r_rel|² - (r_rel · v_rel)² / |v_rel|²)
//
//      This is the perpendicular projection of r_rel onto the plane
//      perpendicular to v_rel. It is exact for constant v_rel.
//
//      This step is critical for high-relative-velocity encounters
//      (rel vel ~10 km/s) where the minimum is sub-100ms wide and
//      1-second sampling would miss it by orders of magnitude.
//
//   4. THRESHOLD CHECK: If d* < screening threshold (default 5 km),
//      this is a conjunction.
//
// Mathematical references:
//   - For a linear relative motion model r(t) = r_0 + v_0*t, the minimum
//     of |r(t)| is found by solving d|r(t)|²/dt = 0, giving
//     t* = - (r_0 · v_0) / |v_0|².
//   - This is the standard "B-plane" approximation used in operational
//     conjunction assessment (see e.g. NASA CARA documentation).
//
// Computational complexity:
//   - Coarse: O((horizon / step) * 1) per pair = ~10,000 samples
//   - Fine: O(candidates * window / step) per pair ≈ 100 * 1200 = 120,000 samples
//   - Analytical: O(1) per pair
//   - Total per pair: ~130,000 propagate() calls
//   - For N primaries × M secondaries: O(N * M * 130,000)
//
// The propagateSgp4() function is heavily cached (satrec cache), so
// repeated calls to the same object at different times are fast.

import { OrbitalObject } from '@/lib/data/celestrak/types';
import { propagateSgp4, PropagatedState } from './sgp4';
import { relativeMotion } from './propagator';  // reuse the relative-motion helper

export interface ConjunctionResult {
  tca: Date;
  minRange: number;          // km
  relVelocity: number;       // km/s
  primaryState: PropagatedState;
  secondaryState: PropagatedState;
  relPosRic: { radial: number; alongTrack: number; crossTrack: number };
  screeningStart: Date;
  screeningEnd: Date;
  screeningThreshold: number;
  separationSeries: { t: Date; range: number }[];  // for 2D plot
}

const COARSE_STEP_SEC = 60;             // 1 minute
const COARSE_THRESHOLD_KM = 600;       // generous — catches all sub-second conjunctions
const FINE_STEP_SEC = 1;               // 1 second
const MAX_FINE_SEARCH_WINDOW_SEC = 600; // ±10 min around coarse min

/**
 * Default screening parameters. The user can override these.
 */
export const DEFAULT_SCREENING_HORIZON_DAYS = 7;
export const DEFAULT_SCREENING_THRESHOLD_KM = 5;

/**
 * Screen two real catalog objects for close approaches over [start, end].
 * Returns the conjunction result if min range < threshold, else null.
 *
 * Both objects must have valid orbital elements (fetched from CelesTrak).
 * The propagation is done with SGP4 (real, B*-aware, J2+J3+J4+...)
 * not the legacy Keplerian.
 */
/**
 * Pre-screening filter: can two objects possibly have a close approach
 * given their perigee/apogee altitudes?
 *
 * If primary.apogee < secondary.perigee - margin, the two orbits never
 * overlap in altitude, so they cannot come close (in 3D).
 *
 * This is a HUGE performance optimization: for a catalog of 1000s of
 * objects at widely varying altitudes, this filters out >90% of pairs
 * before any SGP4 propagation.
 */
export function canApproachByAltitude(
  primary: { perigeeKm?: number; apogeeKm?: number; semiMajorAxisKm?: number },
  secondary: { perigeeKm?: number; apogeeKm?: number; semiMajorAxisKm?: number },
  marginKm = 50,
): boolean {
  // If we don't have perigee/apogee, fall back to semi-major axis comparison
  const pApo = primary.apogeeKm ?? (primary.semiMajorAxisKm ? primary.semiMajorAxisKm + 200 : undefined);
  const pPer = primary.perigeeKm ?? (primary.semiMajorAxisKm ? primary.semiMajorAxisKm - 200 : undefined);
  const sApo = secondary.apogeeKm ?? (secondary.semiMajorAxisKm ? secondary.semiMajorAxisKm + 200 : undefined);
  const sPer = secondary.perigeeKm ?? (secondary.semiMajorAxisKm ? secondary.semiMajorAxisKm - 200 : undefined);
  if (pApo === undefined || pPer === undefined || sApo === undefined || sPer === undefined) {
    return true;  // can't tell, so allow
  }
  // If primary's apogee is below secondary's perigee (with margin), no overlap
  if (pApo < sPer - marginKm) return false;
  if (sApo < pPer - marginKm) return false;
  return true;
}

export function screen(
  primary: OrbitalObject,
  secondary: OrbitalObject,
  start: Date,
  end: Date,
  thresholdKm = DEFAULT_SCREENING_THRESHOLD_KM,
): ConjunctionResult | null {
  // Coarse pass
  const coarseSeries: { t: Date; range: number }[] = [];
  const coarseStatesPrimary: PropagatedState[] = [];
  const coarseStatesSecondary: PropagatedState[] = [];

  for (let ms = start.getTime(); ms <= end.getTime(); ms += COARSE_STEP_SEC * 1000) {
    const t = new Date(ms);
    const p = propagateSgp4(primary, t);
    const s = propagateSgp4(secondary, t);
    const { range } = relativeMotion(p, s);
    coarseSeries.push({ t, range });
    coarseStatesPrimary.push(p);
    coarseStatesSecondary.push(s);
  }

  // Find local minima below COARSE_THRESHOLD
  const candidates: number[] = [];
  for (let i = 1; i < coarseSeries.length - 1; i++) {
    const prev = coarseSeries[i - 1].range;
    const curr = coarseSeries[i].range;
    const next = coarseSeries[i + 1].range;
    if (curr <= prev && curr <= next && curr < COARSE_THRESHOLD_KM) {
      candidates.push(i);
    }
  }
  if (coarseSeries.length > 0 && coarseSeries[0].range < COARSE_THRESHOLD_KM) candidates.unshift(0);
  if (coarseSeries.length > 0 && coarseSeries[coarseSeries.length - 1].range < COARSE_THRESHOLD_KM) candidates.push(coarseSeries.length - 1);

  if (candidates.length === 0) return null;

  // Fine pass: 1-sec step around each candidate
  let bestT = 0;
  let bestRange = Infinity;
  let bestP: PropagatedState | null = null;
  let bestS: PropagatedState | null = null;
  for (const idx of candidates) {
    const coarseT = coarseSeries[idx].t.getTime();
    const fineStart = coarseT - MAX_FINE_SEARCH_WINDOW_SEC * 1000;
    const fineEnd = coarseT + MAX_FINE_SEARCH_WINDOW_SEC * 1000;
    for (let ms = fineStart; ms <= fineEnd; ms += FINE_STEP_SEC * 1000) {
      const t = new Date(Math.max(start.getTime(), Math.min(end.getTime(), ms)));
      const p = propagateSgp4(primary, t);
      const s = propagateSgp4(secondary, t);
      const rel = relativeMotion(p, s);
      if (rel.range < bestRange) {
        bestRange = rel.range;
        bestT = t.getTime();
        bestP = p;
        bestS = s;
      }
    }
  }

  // Analytical TCA refinement (perpendicular projection).
  //   t* = t_fine - (r_rel · v_rel) / |v_rel|²
  //   d* = sqrt(|r_rel|² - (r_rel · v_rel)² / |v_rel|²)
  // This is exact for constant v_rel. For real SGP4 motion, v_rel varies
  // slightly over the short encounter window, so we re-propagate at t* to
  // verify the actual minimum.
  if (bestP && bestS) {
    const dx = bestS.x - bestP.x, dy = bestS.y - bestP.y, dz = bestS.z - bestP.z;
    const dvx = bestS.vx - bestP.vx, dvy = bestS.vy - bestP.vy, dvz = bestS.vz - bestP.vz;
    const posDotVel = dx * dvx + dy * dvy + dz * dvz;
    const velMag2 = dvx * dvx + dvy * dvy + dvz * dvz;
    if (velMag2 > 1e-10) {
      const dtSec = -posDotVel / velMag2;
      // Only apply if the time shift is small (validates the linear approximation)
      if (Math.abs(dtSec) < 60) {
        const refinedT = new Date(bestT + dtSec * 1000);
        try {
          const refinedP = propagateSgp4(primary, refinedT);
          const refinedS = propagateSgp4(secondary, refinedT);
          const refinedRel = relativeMotion(refinedP, refinedS);
          if (refinedRel.range < bestRange && refinedRel.range > 0) {
            bestRange = refinedRel.range;
            bestT = refinedT.getTime();
            bestP = refinedP;
            bestS = refinedS;
          }
        } catch {
          // ignore refinement failure
        }
      }
    }
  }

  if (bestRange >= thresholdKm || !bestP || !bestS) return null;

  // Build separation series around TCA (±1h, 1-min step)
  const seriesStart = bestT - 3600 * 1000;
  const seriesEnd = bestT + 3600 * 1000;
  const separationSeries: { t: Date; range: number }[] = [];
  for (let ms = seriesStart; ms <= seriesEnd; ms += 60 * 1000) {
    const t = new Date(ms);
    try {
      const p = propagateSgp4(primary, t);
      const s = propagateSgp4(secondary, t);
      const { range } = relativeMotion(p, s);
      separationSeries.push({ t, range });
    } catch {
      // skip points that fail to propagate (e.g., reentry)
    }
  }

  const finalRel = relativeMotion(bestP, bestS);
  return {
    tca: new Date(bestT),
    minRange: bestRange,
    relVelocity: finalRel.relVel,
    primaryState: bestP,
    secondaryState: bestS,
    relPosRic: finalRel.relPosRic,
    screeningStart: start,
    screeningEnd: end,
    screeningThreshold: thresholdKm,
    separationSeries,
  };
}

/** Re-screen after a maneuver: same as screen() but with the maneuvered primary. */
export function rescreen(
  primaryNew: OrbitalObject,
  secondary: OrbitalObject,
  start: Date,
  end: Date,
  thresholdKm = DEFAULT_SCREENING_THRESHOLD_KM,
): ConjunctionResult | null {
  return screen(primaryNew, secondary, start, end, thresholdKm);
}
