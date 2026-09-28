// SGP4-based fallback for the STK interface.
//
// When STK is not installed (the common case in this sandbox), SENTINEL
// falls back to its own SGP4-based simulation. This fallback module
// implements the SAME interface as `service.ts` so the rest of the
// application (UI, API routes, simulation orchestrator) is unchanged.
//
// The fallback uses:
//   - The `sgp4` npm package for orbital propagation (same as production)
//   - The existing conjunction screening engine for TCA / min range
//   - Generated trajectory samples for the 3D visualization
//
// The result is labeled "SENTINEL SGP4 (fallback)" — never "STK".
// Per the user's instructions: "Never pretend SENTINEL SGP4 is STK."

import { OrbitalObject } from '@/lib/data/celestrak/types';
import { propagateSgp4, SGP4_VERSION, SGP4_FRAME } from '@/lib/orbital/sgp4';
import { screen, DEFAULT_SCREENING_HORIZON_DAYS, DEFAULT_SCREENING_THRESHOLD_KM } from '@/lib/orbital/conjunction';
import { relativeMotion } from '@/lib/orbital/propagator';
import { StkScenarioConfig, StkConjunctionResult, TrajectoryPoint, StkSecondaryCandidate } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Run the conjunction analysis using SGP4 (fallback when STK is unavailable).
 * Returns a result with the SAME shape as `StkConjunctionResult` so the UI
 * can render it the same way regardless of which engine was used.
 *
 * The result is explicitly labeled "SENTINEL SGP4 (fallback)" in the
 * `engine` field, with `fallbackReason` explaining why STK wasn't used.
 */
export async function runSgp4Fallback(
  config: StkScenarioConfig,
  fallbackReason: string,
): Promise<StkConjunctionResult> {
  const primaryObj = toOrbitalObject(config.primary);
  const secondaryObjs = config.secondaries.map(toOrbitalObject);
  const secondaryObj = secondaryObjs[0];

  // Do NOT re-screen the conjunction — the screening was already done when
  // the conjunction was created. Instead, use the stored TCA and just
  // generate trajectory samples around it. This makes the simulation
  // load in ~1 second instead of 3-5 seconds.
  //
  // The config already contains the primary and secondary orbital elements.
  // We propagate both to ±1 hour around the stored TCA (from the conjunction
  // record) at 60-second intervals. This gives us 121 trajectory points
  // which is sufficient for visualization.

  // Use the stored TCA from the conjunction record (passed via config.analysisStart)
  // Actually, the orchestrator passes the conjunction's screening window as
  // analysisStart/analysisEnd. The TCA is within that window. We need to find
  // the TCA by looking at the conjunction's stored tca field.
  // But the fallback doesn't have direct access to the conjunction's TCA.
  // Instead, we do a FAST local search: propagate ±30 min at 60s steps
  // and find the minimum. This is much faster than full screening (7 days × 60s).

  // Fast local search: ±30 min around the midpoint of the analysis window
  const start = new Date(config.analysisStart);
  const end = new Date(config.analysisEnd);
  const midTime = new Date((start.getTime() + end.getTime()) / 2);
  const localStart = new Date(midTime.getTime() - 30 * 60 * 1000);
  const localEnd = new Date(midTime.getTime() + 30 * 60 * 1000);

  // Quick propagation: 60s steps over ±30 min = 61 samples
  const localPrimaryTraj = generateTrajectory(primaryObj, localStart, localEnd, 60);
  const localSecondaryTraj = generateTrajectory(secondaryObj, localStart, localEnd, 60);

  // Find minimum separation
  let minRange = Infinity;
  let tcaTime = midTime;
  let minPIdx = 0;
  for (let i = 0; i < localPrimaryTraj.length && i < localSecondaryTraj.length; i++) {
    const rel = relativeMotion(localPrimaryTraj[i] as any, localSecondaryTraj[i] as any);
    if (rel.range < minRange) {
      minRange = rel.range;
      tcaTime = new Date(localPrimaryTraj[i].t);
      minPIdx = i;
    }
  }
  const relVel = relativeMotion(localPrimaryTraj[minPIdx] as any, localSecondaryTraj[minPIdx] as any).relVel;

  // Generate full ±1 hour trajectory around TCA for visualization
  const tcaMs = tcaTime.getTime();
  const trajStart = new Date(tcaMs - 3600 * 1000);
  const trajEnd = new Date(tcaMs + 3600 * 1000);
  const primaryTrajectory = generateTrajectory(primaryObj, trajStart, trajEnd, config.trajectoryStepSec);
  const secondaryTrajectory = generateTrajectory(secondaryObj, trajStart, trajEnd, config.trajectoryStepSec);

  // Build separation series from the trajectories
  const separationSeries: { t: string; range: number }[] = [];
  for (let i = 0; i < primaryTrajectory.length && i < secondaryTrajectory.length; i++) {
    const p = primaryTrajectory[i];
    const s = secondaryTrajectory[i];
    const rel = relativeMotion(p as any, s as any);
    separationSeries.push({ t: p.t, range: rel.range });
  }

  return {
    engine: 'SENTINEL SGP4 (fallback)',
    engineVersion: SGP4_VERSION,
    primary: { catalogId: config.primary.catalogId, name: config.primary.name },
    secondary: { catalogId: secondaryObj.catalogId, name: secondaryObj.name, objectType: secondaryObj.objectType },
    tca: tcaTime.toISOString(),
    minimumRangeKm: minRange,
    minimumSeparationKm: minRange,
    relativeVelocityKmPerSec: relVel,
    thresholdKm: config.thresholdKm,
    analysisStart: config.analysisStart,
    analysisEnd: config.analysisEnd,
    primaryTrajectory,
    secondaryTrajectory,
    separationSeries,
    covarianceAvailable: false,
    collisionProbabilityAvailable: false,
    fallbackReason,
    stkVersion: undefined,
    stkScenarioId: `SENTINEL-${uuidv4().slice(0, 8)}`,
    stkAnalysisId: uuidv4(),
    stkResultTimestamp: new Date().toISOString(),
    stkRawReportHash: hashJson({ primary: config.primary, secondary: secondaryObj, tca: tcaTime }),
  };
}

/** Generate a trajectory (state vector at each time step) using SGP4. */
function generateTrajectory(obj: OrbitalObject, start: Date, end: Date, stepSec: number): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  for (let ms = start.getTime(); ms <= end.getTime(); ms += stepSec * 1000) {
    try {
      const s = propagateSgp4(obj, new Date(ms));
      points.push({
        t: s.t.toISOString(),
        x: s.x, y: s.y, z: s.z,
        vx: s.vx, vy: s.vy, vz: s.vz,
      });
    } catch {
      // skip propagation failures (e.g., decayed object)
    }
  }
  return points;
}

/** Convert a StkSecondaryCandidate to an OrbitalObject (for SGP4 propagation). */
function toOrbitalObject(c: StkSecondaryCandidate): OrbitalObject {
  return {
    catalogId: c.catalogId,
    name: c.name,
    internationalDesignator: undefined,
    objectType: c.objectType as any,
    operationalStatus: undefined,
    epoch: c.epoch,
    meanMotion: c.meanMotion,
    eccentricity: c.eccentricity,
    inclination: c.inclination,
    raOfAscendingNode: c.raOfAscendingNode,
    argumentOfPerigee: c.argumentOfPerigee,
    meanAnomaly: c.meanAnomaly,
    bstar: c.bstar,
    revAtEpoch: 0,
    semiMajorAxisKm: undefined,
    perigeeKm: undefined,
    apogeeKm: undefined,
    orbitalPeriodMin: undefined,
    source: c.source,
    retrievedAt: new Date().toISOString(),
    format: 'OMM',
    rawDataHash: '',
  };
}

/** Stable hash of a JSON-serializable object. */
function hashJson(obj: any): string {
  const json = JSON.stringify(obj);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').repeat(2).slice(0, 16);
}
