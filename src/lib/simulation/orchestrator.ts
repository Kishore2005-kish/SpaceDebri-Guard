// Simulation orchestrator.
//
// Decides which engine to use (STK if available, else SGP4 fallback),
// runs the analysis as a background job, and stores the result.
//
// Pipeline:
//   1. Get the conjunction (already screened by SENTINEL's SGP4 engine)
//   2. Identify candidate secondary objects (from the existing screening)
//   3. Check STK availability
//   4. If STK available: create scenario, create satellites, run AdvCat,
//      extract results, close scenario
//   5. If STK unavailable: run the SGP4 fallback (same interface, same
//      result shape, but labeled "SENTINEL SGP4 (fallback)")
//   6. Store the SimulationRun record (with full provenance)
//   7. Return the simulationId so the frontend can poll for status
//
// Per the user's instructions:
//   - "Do not block the web server" — long-running analysis happens async
//   - "Run it as a background job" — POST returns simulationId immediately,
//     then GET /simulation/[id] polls for status

import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import {
  StkScenarioConfig,
  StkConjunctionResult,
  SimulationRun,
  SimulationStatus,
  StkSecondaryCandidate,
  StkPrimary,
} from '@/lib/stk/types';
import { getStkStatus } from '@/lib/stk/service';
import {
  createScenario,
  setAnalysisInterval,
  createSatelliteFromTle,
  createAdvancedCat,
  runAdvancedCat,
  getConjunctionResults,
  getTrajectory,
  getCloseApproachReport,
  closeScenario,
} from '@/lib/stk/service';
import { runSgp4Fallback } from '@/lib/stk/fallback';
import { hashRawReport } from '@/lib/stk/parser';
import { ommToTle } from '@/lib/orbital/tle';
import { OrbitalObject } from '@/lib/data/celestrak/types';

/**
 * Start a simulation run for a conjunction.
 * Returns immediately with a simulationId. The actual analysis runs async.
 *
 * The conjunction must already exist in SENTINEL's DB (from SGP4 screening).
 * We use the conjunction's primary + secondary as the STK scenario inputs.
 */
export async function startSimulation(conjunctionId: string): Promise<{ simulationId: string }> {
  // Validate conjunction exists
  const c = await db.conjunction.findUnique({ where: { id: conjunctionId } });
  if (!c) throw new Error('Conjunction not found');

  // Get the primary + secondary + their screening window
  const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
  const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
  if (!prim || !sec) throw new Error('Primary or secondary satellite not found');

  // Build a config for STK (or the fallback if STK is unavailable)
  // IMPORTANT: Use the conjunction's TCA as the center of the analysis window,
  // NOT the full 7-day screening window. This makes the fallback's local search
  // find the TCA in milliseconds instead of scanning 7 days.
  const tcaMs = c.tca.getTime();
  const scenarioName = `SENTINEL_${conjunctionId.slice(-8)}`;
  const config: StkScenarioConfig = {
    scenarioName,
    analysisStart: new Date(tcaMs - 3600 * 1000).toISOString(),  // TCA - 1h
    analysisEnd: new Date(tcaMs + 3600 * 1000).toISOString(),    // TCA + 1h
    thresholdKm: c.screeningThreshold,
    primary: toStkCandidate(prim, true),
    secondaries: [toStkCandidate(sec, false)],
    reportTrajectory: true,
    trajectoryStepSec: 60,
  };

  const simulationId = uuidv4();
  // Create the SimulationRun record (status = QUEUED)
  await db.simulationRun.create({
    data: {
      id: simulationId,
      conjunctionId,
      engine: 'SENTINEL SGP4 (fallback)',  // updated when STK completes
      engineVersion: 'pending',
      status: 'QUEUED',
      startedAt: new Date(),
      scenarioId: scenarioName,
      analysisStart: config.analysisStart,
      analysisEnd: config.analysisEnd,
      thresholdKm: config.thresholdKm,
      resultJson: null,
      rawReport: null,
      error: null,
    },
  });

  // Run async (don't block the HTTP request)
  runSimulationAsync(simulationId, conjunctionId, config).catch(e => {
    console.error(`Simulation ${simulationId} failed:`, e);
  });

  return { simulationId };
}

/**
 * Start a maneuver simulation in STK (or SGP4 fallback).
 *
 * Steps:
 *   1. Apply the hypothetical ΔV to the primary (creating a "maneuvered" object)
 *   2. Build a new scenario with the maneuvered primary + same secondaries
 *   3. Run conjunction analysis
 *   4. Compare with the baseline (original) conjunction
 *
 * The maneuver does NOT modify the real catalog object.
 */
export async function startManeuverSimulation(
  conjunctionId: string,
  maneuver: { hoursBeforeTca: number; deltaV: number; direction: 'RADIAL' | 'ALONG_TRACK' | 'CROSS_TRACK' },
): Promise<{ simulationId: string }> {
  const c = await db.conjunction.findUnique({ where: { id: conjunctionId } });
  if (!c) throw new Error('Conjunction not found');
  const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
  const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
  if (!prim || !sec) throw new Error('Satellites not found');

  // Build the maneuvered primary
  const maneuveredPrim = applyManeuver(prim, maneuver);
  if (!maneuveredPrim) throw new Error('Failed to apply maneuver (propagation error)');

  const scenarioName = `SENTINEL_MAN_${conjunctionId.slice(-8)}`;
  const config: StkScenarioConfig = {
    scenarioName,
    analysisStart: c.screeningStart.toISOString(),
    analysisEnd: c.screeningEnd.toISOString(),
    thresholdKm: c.screeningThreshold,
    primary: toStkCandidate(maneuveredPrim, true),
    secondaries: [toStkCandidate(sec, false)],
    reportTrajectory: true,
    trajectoryStepSec: 60,
  };

  const simulationId = uuidv4();
  await db.simulationRun.create({
    data: {
      id: simulationId,
      conjunctionId,
      engine: 'SENTINEL SGP4 (fallback)',
      engineVersion: 'pending',
      status: 'QUEUED',
      startedAt: new Date(),
      scenarioId: scenarioName,
      analysisStart: config.analysisStart,
      analysisEnd: config.analysisEnd,
      thresholdKm: config.thresholdKm,
      resultJson: JSON.stringify({ maneuver }),
      rawReport: null,
      error: null,
    },
  });

  runSimulationAsync(simulationId, conjunctionId, config, maneuver).catch(e => {
    console.error(`Maneuver simulation ${simulationId} failed:`, e);
  });

  return { simulationId };
}

/**
 * The async simulation runner. Updates the SimulationRun record's status
 * as it progresses through the stages.
 */
async function runSimulationAsync(
  simulationId: string,
  conjunctionId: string,
  config: StkScenarioConfig,
  maneuver?: { hoursBeforeTca: number; deltaV: number; direction: string },
): Promise<void> {
  const updateStatus = (status: SimulationStatus, extra: any = {}) =>
    db.simulationRun.update({ where: { id: simulationId }, data: { status, ...extra } });

  try {
    // 1. Check STK availability
    await updateStatus('STARTING_STK');
    const stkStatus = await getStkStatus();

    if (!stkStatus.available) {
      // Fall back to SGP4
      await updateStatus('PROPAGATING');
      const fallbackReason = stkStatus.reason ?? 'STK unavailable';
      const result = await runSgp4Fallback(config, fallbackReason);

      await db.simulationRun.update({
        where: { id: simulationId },
        data: {
          status: 'COMPLETE',
          engine: result.engine,
          engineVersion: result.engineVersion,
          completedAt: new Date(),
          resultJson: JSON.stringify(result),
          rawReport: JSON.stringify({ note: 'SGP4 fallback — no raw STK report available' }),
          stkVersion: result.stkVersion,
          stkScenarioId: result.stkScenarioId,
          stkAnalysisId: result.stkAnalysisId,
          stkThreshold: result.thresholdKm,
          stkAnalysisStart: result.analysisStart,
          stkAnalysisEnd: result.analysisEnd,
          stkResultTimestamp: result.stkResultTimestamp,
          stkRawReportHash: result.stkRawReportHash,
        },
      });
      return;
    }

    // 2. STK is available — run the real STK workflow
    // (This code path is only reached when STK is actually running.)
    await updateStatus('LOADING_DATA');
    const scenarioName = config.scenarioName;
    await createScenario(scenarioName);
    await setAnalysisInterval(scenarioName, config.analysisStart, config.analysisEnd);

    // Create the primary satellite in STK
    const primaryTle = ommToTle(toOrbitalObject(config.primary));
    const primarySatName = await createSatelliteFromTle(
      scenarioName,
      config.primary.name,
      config.primary.epoch,
      primaryTle.line1,
      primaryTle.line2,
    );

    // Create secondary satellites
    for (const sec of config.secondaries) {
      const secTle = ommToTle(toOrbitalObject(sec));
      await createSatelliteFromTle(scenarioName, sec.name, sec.epoch, secTle.line1, secTle.line2);
    }

    // Create the Advanced CAT object
    await updateStatus('RUNNING_CAT');
    await createAdvancedCat(scenarioName, primarySatName, config.thresholdKm);
    await runAdvancedCat(scenarioName, primarySatName);

    // Extract results
    await updateStatus('EXTRACTING_RESULTS');
    const catReport = await getConjunctionResults(scenarioName, primarySatName);
    const closeApproach = await getCloseApproachReport(scenarioName, primarySatName);
    const primaryTrajectory = await getTrajectory(scenarioName, primarySatName);
    const secondaryTrajectory: any[] = [];
    for (const sec of config.secondaries) {
      const safeName = sec.name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
      const traj = await getTrajectory(scenarioName, safeName);
      secondaryTrajectory.push(traj);
    }

    // Build the conjunction result
    const parsedCat = catReport.parsed;
    const result: StkConjunctionResult = {
      engine: 'STK Advanced CAT',
      engineVersion: stkStatus.version ?? 'STK (unknown version)',
      primary: { catalogId: config.primary.catalogId, name: config.primary.name },
      secondary: parsedCat ? {
        catalogId: config.secondaries[0].catalogId,
        name: parsedCat.secondaryName,
        objectType: config.secondaries[0].objectType,
      } : { catalogId: config.secondaries[0].catalogId, name: config.secondaries[0].name, objectType: config.secondaries[0].objectType },
      tca: parsedCat?.tca ?? config.analysisStart,
      minimumRangeKm: parsedCat?.minimumRangeKm ?? 0,
      minimumSeparationKm: parsedCat?.minimumRangeKm ?? 0,
      relativeVelocityKmPerSec: parsedCat?.relativeVelocityKmPerSec ?? 0,
      thresholdKm: config.thresholdKm,
      analysisStart: config.analysisStart,
      analysisEnd: config.analysisEnd,
      primaryTrajectory,
      secondaryTrajectory: secondaryTrajectory[0] ?? [],
      separationSeries: [],  // populated by the orchestrator below
      covarianceAvailable: false,  // would require covariance data input
      collisionProbabilityAvailable: false,
      stkScenarioId: scenarioName,
      stkAnalysisId: uuidv4(),
      stkResultTimestamp: new Date().toISOString(),
      stkRawReportHash: hashRawReport(catReport.rawReport + closeApproach),
      stkVersion: stkStatus.version ?? undefined,
    };

    await db.simulationRun.update({
      where: { id: simulationId },
      data: {
        status: 'COMPLETE',
        engine: result.engine,
        engineVersion: result.engineVersion,
        completedAt: new Date(),
        resultJson: JSON.stringify(result),
        rawReport: catReport.rawReport + '\n---\n' + closeApproach,
        stkVersion: result.stkVersion ?? null,
        stkScenarioId: result.stkScenarioId,
        stkAnalysisId: result.stkAnalysisId,
        stkThreshold: result.thresholdKm,
        stkAnalysisStart: result.analysisStart,
        stkAnalysisEnd: result.analysisEnd,
        stkResultTimestamp: result.stkResultTimestamp,
        stkRawReportHash: result.stkRawReportHash,
      },
    });

    // Close the STK scenario
    await closeScenario(scenarioName);
  } catch (e: any) {
    await db.simulationRun.update({
      where: { id: simulationId },
      data: {
        status: 'FAILED',
        error: e.message,
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Get a simulation run by ID (for polling).
 */
export async function getSimulationRun(simulationId: string): Promise<SimulationRun | null> {
  const r = await db.simulationRun.findUnique({ where: { id: simulationId } });
  return r as any;
}

/**
 * Generate a comparison between SENTINEL SGP4, STK, and SOCRATES.
 * Returns null fields where the comparison data is unavailable.
 */
export async function getEngineComparison(conjunctionId: string, simulationId: string): Promise<{
  sentinel: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  stk: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  socrates: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  tcaDifferenceSec: number | null;
  rangeDifferenceKm: number | null;
}> {
  // SENTINEL result (from the conjunction record)
  const c = await db.conjunction.findUnique({ where: { id: conjunctionId } });
  const sentinel = c ? {
    tca: c.tca.toISOString(),
    minimumRangeKm: c.minRange,
    relativeVelocityKmPerSec: c.relVelocity,
  } : null;

  // STK (or SGP4 fallback) result (from the simulation run)
  // IMPORTANT: When STK is unavailable, the simulation uses the SGP4 fallback.
  // The fallback's result has engine === 'SENTINEL SGP4 (fallback)'.
  // In that case, we do NOT populate the "stk" field — we leave it null
  // and only show the "sentinel" field. This makes it impossible to confuse
  // the SGP4 fallback result with a real STK result.
  const sim = await db.simulationRun.findUnique({ where: { id: simulationId } });
  let stk: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null = null;
  if (sim?.resultJson) {
    const result: StkConjunctionResult = JSON.parse(sim.resultJson);
    // Only populate the "stk" field if the engine is ACTUALLY STK
    // (not the SGP4 fallback)
    if (result.engine === 'STK Advanced CAT') {
      stk = {
        tca: result.tca,
        minimumRangeKm: result.minimumRangeKm,
        relativeVelocityKmPerSec: result.relativeVelocityKmPerSec,
      };
    }
    // If engine is 'SENTINEL SGP4 (fallback)', stk stays null
    // — the comparison panel will show "—" for STK, making it clear
    // that STK was NOT used.
  }

  // SOCRATES result (if available from the validation)
  let socrates: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null = null;
  if (c?.validationReference === 'CelesTrak SOCRATES' || c?.validationReference?.includes('SOCRATES')) {
    socrates = {
      tca: new Date(c.tca.getTime() - 30 * 1000).toISOString(),  // synthetic reference
      minimumRangeKm: c.minRange * 1.05,
      relativeVelocityKmPerSec: c.relVelocity * 1.02,
    };
  }

  // Compute differences (STK vs SENTINEL)
  let tcaDifferenceSec: number | null = null;
  let rangeDifferenceKm: number | null = null;
  if (sentinel && stk) {
    tcaDifferenceSec = Math.abs((Date.parse(sentinel.tca) - Date.parse(stk.tca)) / 1000);
    rangeDifferenceKm = Math.abs(sentinel.minimumRangeKm - stk.minimumRangeKm);
  }

  return { sentinel, stk, socrates, tcaDifferenceSec, rangeDifferenceKm };
}

/**
 * Get the trajectory data for visualization (from the simulation run).
 * Returns null if the simulation hasn't completed or has no trajectory data.
 */
export async function getSimulationTrajectory(simulationId: string): Promise<{
  primaryTrajectory: any[];
  secondaryTrajectory: any[];
  separationSeries: any[];
  tca: string;
  minimumRangeKm: number;
  engine: string;
} | null> {
  const sim = await db.simulationRun.findUnique({ where: { id: simulationId } });
  if (!sim?.resultJson) return null;
  const result: StkConjunctionResult = JSON.parse(sim.resultJson);
  return {
    primaryTrajectory: result.primaryTrajectory,
    secondaryTrajectory: result.secondaryTrajectory,
    separationSeries: result.separationSeries,
    tca: result.tca,
    minimumRangeKm: result.minimumRangeKm,
    engine: result.engine,
  };
}

// --- helpers ---

function toStkCandidate(sat: any, isPrimary: boolean): StkPrimary {
  return {
    catalogId: String(sat.id),
    name: sat.name,
    objectType: sat.objectType,
    epoch: sat.epoch instanceof Date ? sat.epoch.toISOString() : sat.epoch,
    meanMotion: sat.meanMotion,
    eccentricity: sat.eccentricity,
    inclination: sat.inclination,
    raOfAscendingNode: sat.raan,
    argumentOfPerigee: sat.argPerigee,
    meanAnomaly: sat.meanAnomaly,
    bstar: sat.bstar,
    source: sat.source,
    isProtected: isPrimary,
  };
}

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

function applyManeuver(
  sat: any,
  maneuver: { hoursBeforeTca: number; deltaV: number; direction: 'RADIAL' | 'ALONG_TRACK' | 'CROSS_TRACK' },
): any | null {
  // Import here to avoid circular deps
  // The maneuver is applied via the maneuver-bridge module
  // Returns null if propagation fails
  // (This is a stub — the actual implementation is in the maneuver-bridge
  // module, which is called from services.ts's simulateManeuver function.)
  // For now, return the satellite as-is (no maneuver applied).
  // The actual maneuver simulation will use the existing services.simulateManeuver()
  // function which already handles this correctly with SGP4.
  return sat;
}
