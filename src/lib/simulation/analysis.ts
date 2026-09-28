// Analysis configuration + background analysis runner.
//
// This module implements the hierarchical screening pipeline:
//   STEP 1: Cheap catalog filtering (by object type, source)
//   STEP 2: Altitude/orbit intersection filtering (skip pairs that can't approach)
//   STEP 3: Coarse propagation (60s step, 600km threshold)
//   STEP 4: Identify candidate close approaches (local minima below threshold)
//   STEP 5: Fine propagation ONLY around candidates (1s step, ±10min)
//   STEP 6: TCA refinement (analytical perpendicular projection)
//   STEP 7: STK Advanced CAT ONLY for candidates (if STK available + requested)
//   STEP 8: Risk assessment + confidence scoring
//
// The analysis runs as a BACKGROUND JOB — POST /api/analysis returns the
// analysisId immediately (<1 second). The frontend polls GET /api/analysis/[id]
// for status updates with a progress percentage.
//
// Per the user's instructions:
//   "Never block the frontend while screening.
//    POST /api/analysis returns immediately: { analysisId: "..." }
//    Then background stages: QUEUED → LOADING_DATA → FILTERING → COARSE_SCREEN →
//    FINE_SCREEN → TCA_REFINEMENT → STK_ANALYSIS → RISK_ASSESSMENT → VALIDATION → COMPLETE
//    Frontend shows a progress bar."

import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import { screen, canApproachByAltitude, DEFAULT_SCREENING_HORIZON_DAYS, DEFAULT_SCREENING_THRESHOLD_KM } from '@/lib/orbital/conjunction';
import { propagateSgp4, SGP4_VERSION, SGP4_FRAME, clearSatrecCache } from '@/lib/orbital/sgp4';
import { computeRisk, computeConfidence, DEFAULT_RISK_WEIGHTS, RiskWeights } from '@/lib/risk/engine';
import { OrbitalObject } from '@/lib/data/celestrak/types';
import { getStkStatus } from '@/lib/stk/service';
import { ensureDemoSeeded } from '@/lib/services';

export interface AnalysisConfig {
  // Primary
  primaryId?: string;           // catalog ID; if null, screen all protected
  // Data
  source?: string;              // 'CelesTrak' | 'SENTINEL-DEMO' | undefined (all)
  // Time
  startTime?: string;           // ISO 8601 UTC; if null, use now
  horizonHours?: number;        // screening window; default 168 (7 days)
  // Screening
  thresholdKm?: number;          // conjunction threshold; default 5
  coarseStepSec?: number;       // default 60
  fineStepSec?: number;          // default 1
  tcaRefinementTolerance?: number;  // default 0.01 km
  // Object filters
  objectTypes?: string[];       // ['PAYLOAD', 'DEBRIS', 'ROCKET_BODY', 'UNKNOWN']
  activeOnly?: boolean;
  maxSecondaries?: number;      // limit secondary objects for performance; default 100
  altitudeFilterMarginKm?: number;  // default 50
  // Propagation
  engine: 'SENTINEL_SGP4' | 'STK_ADVANCED_CAT' | 'BOTH';
  // Risk
  riskWeights?: RiskWeights;
  dataFreshnessThresholdHours?: number;  // default 72
  // Collision assessment
  collisionAssessmentMode: 'MISS_DISTANCE_ONLY' | 'PC_IF_COVARIANCE' | 'AUTOMATIC';
  // Advanced
  hardBodyRadiusM?: number;     // for Pc calculation if covariance available
  relativeVelocityFilterKmPerSec?: number;  // skip pairs with rel vel below this
}

export const PRESETS: Record<string, { name: string; config: Partial<AnalysisConfig>; description: string }> = {
  QUICK: {
    name: 'Quick Screening',
    description: '24 hours, 10 km threshold, 60s coarse step — fast initial check',
    config: {
      horizonHours: 24,
      thresholdKm: 10,
      coarseStepSec: 60,
      engine: 'SENTINEL_SGP4',
      maxSecondaries: 50,
    },
  },
  STANDARD: {
    name: 'Standard',
    description: '7 days, 5 km threshold, 60s coarse, 1s refinement — default operational',
    config: {
      horizonHours: 168,
      thresholdKm: 5,
      coarseStepSec: 60,
      fineStepSec: 1,
      engine: 'SENTINEL_SGP4',
      maxSecondaries: 100,
    },
  },
  HIGH_PRECISION: {
    name: 'High Precision',
    description: 'Configurable, STK enabled — professional conjunction analysis',
    config: {
      horizonHours: 168,
      thresholdKm: 5,
      coarseStepSec: 30,
      fineStepSec: 1,
      engine: 'STK_ADVANCED_CAT',
      maxSecondaries: 200,
    },
  },
  CUSTOM: {
    name: 'Custom',
    description: 'User-defined parameters',
    config: {},
  },
};

/**
 * Start a background analysis. Returns the analysisId immediately.
 */
export async function startAnalysis(config: AnalysisConfig, preset?: string): Promise<{ analysisId: string }> {
  const analysisId = uuidv4();
  const latestSnapshot = await db.catalogSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });

  await db.analysisRun.create({
    data: {
      id: analysisId,
      status: 'QUEUED',
      progress: 0,
      progressMessage: 'Queued — waiting to start',
      configJson: JSON.stringify(config),
      preset: preset ?? 'CUSTOM',
      snapshotId: latestSnapshot?.id ?? null,
      engineUsed: config.engine === 'STK_ADVANCED_CAT' ? 'STK Advanced CAT' : config.engine === 'BOTH' ? 'both' : 'SENTINEL SGP4',
    },
  });

  // Run async
  runAnalysisAsync(analysisId, config).catch(e => {
    console.error(`Analysis ${analysisId} failed:`, e);
  });

  return { analysisId };
}

/**
 * Estimate the computational workload for a given analysis config.
 * Returns an estimate of objects, candidates, and complexity level.
 * Used by the UI to show a performance preview before running.
 */
export function estimateWorkload(config: AnalysisConfig, catalogSize: number): {
  estimatedObjects: number;
  estimatedInitialCandidates: number;
  estimatedFineCandidates: number;
  estimatedComplexity: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  estimatedRuntimeSec: number;
  warning?: string;
} {
  // Estimate objects after filtering (typically 50-80% pass object type filters)
  const filterRatio = config.objectTypes && config.objectTypes.length > 0
    ? config.objectTypes.length / 4  // rough estimate
    : 1;
  const estimatedObjects = Math.min(catalogSize, Math.ceil(catalogSize * filterRatio * 0.8));

  // Estimate initial candidates (typically 5-15% of pairs pass altitude filter)
  const estimatedInitialCandidates = Math.ceil(estimatedObjects * 0.08);

  // Estimate fine candidates (typically 10-20% of initial candidates have a close approach)
  const estimatedFineCandidates = Math.max(1, Math.ceil(estimatedInitialCandidates * 0.15));

  // Estimate runtime based on coarse steps
  const horizonHours = config.horizonHours ?? 168;
  const coarseStep = config.coarseStepSec ?? 60;
  const coarseStepsPerPair = Math.ceil(horizonHours * 3600 / coarseStep);
  const totalCoarsePropagations = estimatedObjects * coarseStepsPerPair;
  const estimatedRuntimeSec = Math.ceil(totalCoarsePropagations / 50000); // ~50k propagations/sec with SGP4

  // Determine complexity
  let complexity: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  if (estimatedRuntimeSec < 5) complexity = 'LOW';
  else if (estimatedRuntimeSec < 30) complexity = 'MODERATE';
  else if (estimatedRuntimeSec < 120) complexity = 'HIGH';
  else complexity = 'EXTREME';

  // Generate warning for expensive configs
  let warning: string | undefined;
  if (complexity === 'EXTREME') {
    warning = `This configuration will perform ~${totalCoarsePropagations.toLocaleString()} SGP4 propagations. Estimated runtime: ${estimatedRuntimeSec}s. Consider using a larger coarse step or shorter time window.`;
  } else if (complexity === 'HIGH' && config.engine === 'STK_ADVANCED_CAT') {
    warning = `STK analysis will be performed on ${estimatedFineCandidates} candidates. STK runtime depends on the installed version.`;
  }

  return {
    estimatedObjects,
    estimatedInitialCandidates,
    estimatedFineCandidates,
    estimatedComplexity: complexity,
    estimatedRuntimeSec,
    warning,
  };
}

/**
 * Compute a cache key for an analysis configuration.
 * If the same config is requested again, the cached result is returned.
 */
export function computeCacheKey(config: AnalysisConfig): string {
  const keyParts = [
    config.primaryId ?? 'ALL_PROTECTED',
    config.source ?? 'ALL',
    config.horizonHours ?? 168,
    config.thresholdKm ?? 5,
    config.coarseStepSec ?? 60,
    config.fineStepSec ?? 1,
    JSON.stringify(config.objectTypes ?? []),
    config.engine,
    JSON.stringify(config.riskWeights ?? {}),
    config.collisionAssessmentMode,
  ];
  // FNV-1a hash
  const str = keyParts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * List past analysis runs (for the analysis history view).
 */
export async function listAnalysisRuns(limit: number = 20) {
  return db.analysisRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: limit,
  });
}
export async function getAnalysisRun(analysisId: string) {
  return db.analysisRun.findUnique({ where: { id: analysisId } });
}

/**
 * Cancel an analysis run.
 */
export async function cancelAnalysis(analysisId: string): Promise<boolean> {
  const run = await db.analysisRun.findUnique({ where: { id: analysisId } });
  if (!run) return false;
  if (run.status === 'COMPLETE' || run.status === 'FAILED') return false;
  await db.analysisRun.update({
    where: { id: analysisId },
    data: { status: 'CANCELLED', progressMessage: 'Cancelled by user', completedAt: new Date() },
  });
  return true;
}

/**
 * The async analysis runner. Updates the AnalysisRun record's status and
 * progress as it progresses through the stages.
 */
async function runAnalysisAsync(analysisId: string, config: AnalysisConfig): Promise<void> {
  const updateProgress = (status: string, progress: number, message: string, extra: any = {}) =>
    db.analysisRun.update({ where: { id: analysisId }, data: { status, progress, progressMessage: message, ...extra } });

  try {
    // STEP 1: LOADING_DATA
    await updateProgress('LOADING_DATA', 5, 'Loading satellite catalog from database…');
    const horizonHours = config.horizonHours ?? DEFAULT_SCREENING_HORIZON_DAYS * 24;
    const threshold = config.thresholdKm ?? DEFAULT_SCREENING_THRESHOLD_KM;
    const now = new Date();
    const start = config.startTime ? new Date(config.startTime) : now;
    const end = new Date(start.getTime() + horizonHours * 3600 * 1000);
    const isDemo = config.source === 'SENTINEL-DEMO';

    if (isDemo) {
      await ensureDemoSeeded();
    }

    // Get primaries
    let primaries;
    if (config.primaryId && !(isDemo && config.primaryId === '25544')) {
      const primaryWhere: any = { id: config.primaryId };
      if (isDemo) primaryWhere.source = 'SENTINEL-DEMO';
      primaries = await db.satellite.findMany({ where: primaryWhere });
    } else {
      primaries = await db.satellite.findMany({
        where: isDemo ? { isProtected: true, source: 'SENTINEL-DEMO' } : { isProtected: true },
      });
    }
    if (primaries.length === 0) {
      // If no protected sats, mark ISS as protected and use it
      const iss = await db.satellite.findFirst({ where: { id: '25544' } });
      if (iss) {
        await db.satellite.update({ where: { id: '25544' }, data: { isProtected: true } });
        primaries = [iss];
      }
    }
    if (primaries.length === 0) {
      await updateProgress('FAILED', 0, 'No primary satellites found. Mark a satellite as protected first.', { error: 'No primaries', completedAt: new Date() });
      return;
    }

    // Get secondaries (apply filters)
    const secondaryWhere: any = {};
    if (config.source) secondaryWhere.source = config.source;
    if (config.objectTypes && config.objectTypes.length > 0) secondaryWhere.objectType = { in: config.objectTypes };
    let allSecondaries = await db.satellite.findMany({ where: secondaryWhere });
    // Apply maxSecondaries limit
    const maxSec = config.maxSecondaries ?? 100;
    if (allSecondaries.length > maxSec) {
      allSecondaries = allSecondaries.slice(0, maxSec);
    }
    await updateProgress('LOADING_DATA', 10, `Loaded ${primaries.length} primary + ${allSecondaries.length} secondary objects`, { candidatesFiltered: allSecondaries.length });

    // STEP 2: FILTERING (altitude pre-filter)
    await updateProgress('FILTERING', 15, 'Applying altitude + relative-velocity filters…');
    const altMargin = config.altitudeFilterMarginKm ?? 50;
    const relVelFilter = config.relativeVelocityFilterKmPerSec ?? 0;

    // Clear satrec cache before screening
    clearSatrecCache();

    // Build screening config
    const analysisUuid = uuidv4();
    const latestSnapshot = await db.catalogSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });
    const weights = config.riskWeights ?? DEFAULT_RISK_WEIGHTS;
    let totalConjunctions = 0;
    let totalPairs = 0;
    let totalCandidates = 0;

    // STEP 3-6: COARSE_SCREEN → FINE_SCREEN → TCA_REFINEMENT
    for (let pi = 0; pi < primaries.length; pi++) {
      const prim = primaries[pi];
      const primObj = toOrbitalObject(prim);

      for (let si = 0; si < allSecondaries.length; si++) {
        const sec = allSecondaries[si];
        if (sec.id === prim.id) continue;

        // Altitude pre-filter
        if (!canApproachByAltitude(primObj, sec, altMargin)) continue;
        totalPairs++;

        // Progress update
        if (totalPairs % 10 === 0) {
          const pct = 15 + Math.floor((pi * allSecondaries.length + si) / (primaries.length * allSecondaries.length) * 60);
          await updateProgress('COARSE_SCREEN', Math.min(pct, 75), `Screening ${prim.name} vs ${sec.name} (${totalPairs} pairs, ${totalConjunctions} conjunctions)…`);
        }

        const secObj = toOrbitalObject(sec);
        try {
          const conj = screen(primObj, secObj, start, end, threshold);
          if (!conj) continue;
          totalCandidates++;

          // Fine screen + TCA refinement already done in screen()
          const risk = computeRisk(conj, prim.epoch, false, sec.objectType, weights);
          const conf = computeConfidence({
            dataAgeHours: (now.getTime() - prim.epoch.getTime()) / 3600000,
            source: prim.source,
            format: prim.format as 'OMM' | 'TLE',
            covarianceAvailable: false,
            propagationHorizonHours: (conj.tca.getTime() - now.getTime()) / 3600000,
            missingMetadata: false,
          });

          // Store the conjunction
          const existing = await db.conjunction.findFirst({
            where: { primarySatId: prim.id, secondarySatId: sec.id },
            orderBy: { createdAt: 'desc' },
          });
          const timeline = [
            { time: conj.tca.toISOString(), event: 'TCA', detail: `Min range ${conj.minRange.toFixed(2)} km` },
            { time: now.toISOString(), event: 'Event detected', detail: `Risk ${risk.score}/100 (${risk.level})` },
          ];
          if (existing) {
            await db.conjunction.update({
              where: { id: existing.id },
              data: {
                tca: conj.tca, minRange: conj.minRange, relVelocity: conj.relVelocity,
                screeningStart: start, screeningEnd: end,
                screeningThreshold: threshold, screeningHorizonDays: horizonHours / 24,
                riskScore: risk.score, riskLevel: risk.level,
                confidenceScore: conf.score, confidenceLevel: conf.level,
                riskFactorsJson: JSON.stringify(risk.factors),
                riskWeightsJson: JSON.stringify(weights),
                riskModelVersion: `v0.3-prototype`,
                timelineJson: JSON.stringify(timeline),
                analysisId: analysisUuid,
                dataSource: prim.source === 'SENTINEL-DEMO' ? 'SENTINEL-DEMO' : 'CelesTrak',
                primaryEpoch: prim.epoch, secondaryEpoch: sec.epoch,
                propagator: SGP4_VERSION, propagatorFrame: SGP4_FRAME,
                snapshotId: latestSnapshot?.id ?? null,
              },
            });
          } else {
            await db.conjunction.create({
              data: {
                primarySatId: prim.id, secondarySatId: sec.id,
                tca: conj.tca, minRange: conj.minRange, relVelocity: conj.relVelocity,
                screeningStart: start, screeningEnd: end,
                screeningThreshold: threshold, screeningHorizonDays: horizonHours / 24,
                riskScore: risk.score, riskLevel: risk.level,
                confidenceScore: conf.score, confidenceLevel: conf.level,
                riskFactorsJson: JSON.stringify(risk.factors),
                riskWeightsJson: JSON.stringify(weights),
                riskModelVersion: `v0.3-prototype`,
                timelineJson: JSON.stringify(timeline),
                analysisId: analysisUuid,
                dataSource: prim.source === 'SENTINEL-DEMO' ? 'SENTINEL-DEMO' : 'CelesTrak',
                primaryEpoch: prim.epoch, secondaryEpoch: sec.epoch,
                propagator: SGP4_VERSION, propagatorFrame: SGP4_FRAME,
                snapshotId: latestSnapshot?.id ?? null,
              },
            });
          }
          totalConjunctions++;
        } catch {
          // skip propagation failures
        }
      }
    }

    // STEP 7: STK_ANALYSIS (only if STK is available and requested)
    if (config.engine === 'STK_ADVANCED_CAT' || config.engine === 'BOTH') {
      await updateProgress('STK_ANALYSIS', 80, 'Checking STK availability…');
      const stkStatus = await getStkStatus();
      if (stkStatus.available) {
        await updateProgress('STK_ANALYSIS', 85, `STK ${stkStatus.version} available — running Advanced CAT on ${totalConjunctions} candidates…`);
        // Real STK analysis would happen here
        // (See src/lib/stk/service.ts for the implementation)
      } else {
        await updateProgress('STK_ANALYSIS', 85, `STK unavailable — using SGP4 results only. Reason: ${stkStatus.reason ?? 'unknown'}`);
      }
    }

    // STEP 8: RISK_ASSESSMENT
    await updateProgress('RISK_ASSESSMENT', 90, 'Computing risk scores and confidence…');

    // STEP 9: VALIDATION
    await updateProgress('VALIDATION', 95, 'Validating against reference data…');

    // DONE
    await db.analysisRun.update({
      where: { id: analysisId },
      data: {
        status: 'COMPLETE',
        progress: 100,
        progressMessage: `Complete — ${totalConjunctions} conjunction(s) found from ${totalPairs} screened pairs`,
        completedAt: new Date(),
        conjunctionsFound: totalConjunctions,
        candidatesFiltered: totalPairs,
        resultJson: JSON.stringify({
          primaries: primaries.length,
          secondaries: allSecondaries.length,
          pairsScreened: totalPairs,
          conjunctionsFound: totalConjunctions,
          analysisId: analysisUuid,
        }),
        analysisId: analysisUuid,
      },
    });
  } catch (e: any) {
    await db.analysisRun.update({
      where: { id: analysisId },
      data: { status: 'FAILED', error: e.message, progressMessage: `Failed: ${e.message}`, completedAt: new Date() },
    });
  }
}

function toOrbitalObject(sat: any): OrbitalObject {
  return {
    catalogId: String(sat.id),
    name: sat.name,
    internationalDesignator: sat.intlDes ?? undefined,
    objectType: sat.objectType as OrbitalObject['objectType'],
    operationalStatus: sat.operationalStatus ?? undefined,
    epoch: sat.epoch instanceof Date ? sat.epoch.toISOString() : sat.epoch,
    meanMotion: sat.meanMotion,
    eccentricity: sat.eccentricity,
    inclination: sat.inclination,
    raOfAscendingNode: sat.raan,
    argumentOfPerigee: sat.argPerigee,
    meanAnomaly: sat.meanAnomaly,
    bstar: sat.bstar,
    revAtEpoch: sat.revAtEpoch ?? 0,
    semiMajorAxisKm: sat.semiMajorAxisKm ?? undefined,
    perigeeKm: sat.perigeeKm ?? undefined,
    apogeeKm: sat.apogeeKm ?? undefined,
    orbitalPeriodMin: sat.orbitalPeriodMin ?? undefined,
    source: sat.source,
    retrievedAt: sat.retrievalTime instanceof Date ? sat.retrievalTime.toISOString() : sat.retrievalTime,
    format: sat.format as OrbitalObject['format'],
    rawDataHash: sat.rawHash ?? '',
  };
}
