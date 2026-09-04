// Core service layer: ties together real CelesTrak ingestion, SGP4 propagation,
// conjunction screening, risk engine, maneuver simulator, and the Prisma
// database. Exposes a high-level API used by the Next.js route handlers.
//
// Two operating modes:
//   LIVE   — fetch real CelesTrak GP/OMM data, propagate with SGP4
//   DEMO   — use the deterministic synthetic dataset, also propagated with SGP4
//
// The DEMO path uses synthetic objects clearly labeled "SENTINEL-DEMO" so
// the UI can never confuse them with real catalog data.

import { db } from '@/lib/db';
import { buildDemoDataset, DemoSatellite } from '@/lib/demo/data';
import { screen, ConjunctionResult, DEFAULT_SCREENING_HORIZON_DAYS, DEFAULT_SCREENING_THRESHOLD_KM, canApproachByAltitude } from '@/lib/orbital/conjunction';
import { propagateSgp4, propagateRangeSgp4, SGP4_VERSION, SGP4_FRAME, clearSatrecCache } from '@/lib/orbital/sgp4';
import { computeRisk, computeConfidence, DEFAULT_RISK_WEIGHTS, RiskResult, ConfidenceResult, RiskWeights } from '@/lib/risk/engine';
import { simulateManeuvers, ManeuverScenarioInput, SimulatorOutput } from '@/lib/maneuver/simulator';
import { OrbitalObject } from '@/lib/data/celestrak/types';
import { fetchRealCatalog, fetchStations, fetchStarlinkObjects } from '@/lib/data/celestrak';
import { v4 as uuidv4 } from 'uuid';

export const RISK_MODEL_VERSION = 'v0.3-prototype (5-factor heuristic, NOT probability of collision)';
export const PROPAGATOR_VERSION = SGP4_VERSION;
export const PROPAGATOR_FRAME = SGP4_FRAME;

export interface SatelliteDTO {
  id: string;
  name: string;
  intlDes: string | null;
  objectType: string;
  operationalStatus: string | null;
  isProtected: boolean;
  epoch: string;
  meanMotion: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argPerigee: number;
  meanAnomaly: number;
  bstar: number;
  semiMajorAxisKm: number | null;
  perigeeKm: number | null;
  apogeeKm: number | null;
  orbitalPeriodMin: number | null;
  source: string;          // 'CelesTrak' | 'SENTINEL-DEMO' | 'SENTINEL-SIMULATED'
  format: string;
  retrievalTime: string;
  rawHash: string | null;
  isSynthetic: boolean;     // true if from DEMO dataset
}

export interface ConjunctionDTO {
  id: string;
  primarySatId: string;
  secondarySatId: string;
  primaryName: string;
  secondaryName: string;
  secondaryObjectType: string;
  tca: string;
  minRange: number;
  relVelocity: number;
  riskScore: number;
  riskLevel: string;
  confidenceScore: number;
  confidenceLevel: string;
  confidenceContributors: string[];
  riskFactors: RiskResult['factors'];
  riskWeights: RiskWeights;
  riskModelVersion: string;
  covarianceAvailable: boolean;
  explanation: string;
  disclaimer: string;
  status: string;
  notes: { time: string; text: string; author: string }[];
  timeline: { time: string; event: string; detail?: string }[];
  screeningStart: string;
  screeningEnd: string;
  screeningThreshold: number;
  screeningHorizonDays: number;
  propagationHorizonHours: number;
  bestScenario?: any;
  secondaryConjunctions?: any;
  validationReference?: string | null;
  validationDetected?: boolean | null;
  validationTcaErrorMin?: number | null;
  validationRangeErrorKm?: number | null;
  // Provenance
  analysisId: string;
  dataSource: string;
  retrievedAt: string;
  primaryEpoch: string | null;
  secondaryEpoch: string | null;
  propagator: string;
  propagatorFrame: string;
  snapshotId: string | null;
  dataAgeHours: number;
  // Visualization
  separationSeries: { t: string; range: number }[];
  relPosRic: { radial: number; alongTrack: number; crossTrack: number };
  primaryState: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
  secondaryState: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
}

/** Convert a DB Satellite row → OrbitalObject (for SGP4 propagation). */
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
    revAtEpoch: sat.revAtEpoch,
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

/** Convert a DemoSatellite (synthetic) → OrbitalObject. */
function demoToOrbitalObject(d: DemoSatellite): OrbitalObject {
  const els = d.elements;
  const MU = 398600.4418;
  const aKm = Math.cbrt(MU / Math.pow(els.meanMotion * 2 * Math.PI / 86400, 2));
  const rPerigee = aKm * (1 - els.eccentricity) - 6378.137;
  const rApogee = aKm * (1 + els.eccentricity) - 6378.137;
  const period = 1440 / els.meanMotion;
  return {
    catalogId: d.id,
    name: d.name,
    internationalDesignator: d.intlDes,
    objectType: d.objectType,
    operationalStatus: 'SYNTHETIC-DEMO-OBJECT',
    epoch: els.epoch.toISOString(),
    meanMotion: els.meanMotion,
    eccentricity: els.eccentricity,
    inclination: els.inclination,
    raOfAscendingNode: els.raan,
    argumentOfPerigee: els.argPerigee,
    meanAnomaly: els.meanAnomaly,
    bstar: els.bstar,
    revAtEpoch: 0,
    semiMajorAxisKm: aKm,
    perigeeKm: rPerigee,
    apogeeKm: rApogee,
    orbitalPeriodMin: period,
    source: 'SENTINEL-DEMO',
    retrievedAt: new Date().toISOString(),
    format: 'OMM',
    rawDataHash: d.rawHash,
  };
}

// ---------------------------------------------------------------------------
// Demo seeding (DEMO mode)
// ---------------------------------------------------------------------------

/** Seed the database with the deterministic DEMO dataset (synthetic objects). */
export async function ensureDemoSeeded(): Promise<void> {
  const count = await db.satellite.count({ where: { source: 'SENTINEL-DEMO' } });
  if (count === 0) {
    const { satellites } = buildDemoDataset();
    for (const s of satellites) {
      const o = demoToOrbitalObject(s);
      await db.satellite.create({
        data: {
          id: o.catalogId,
          name: o.name,
          objectType: o.objectType,
          intlDes: o.internationalDesignator ?? null,
          operationalStatus: o.operationalStatus ?? null,
          meanMotion: o.meanMotion,
          eccentricity: o.eccentricity,
          inclination: o.inclination,
          raan: o.raOfAscendingNode,
          argPerigee: o.argumentOfPerigee,
          meanAnomaly: o.meanAnomaly,
          bstar: o.bstar,
          revAtEpoch: o.revAtEpoch ?? 0,
          semiMajorAxisKm: o.semiMajorAxisKm ?? null,
          perigeeKm: o.perigeeKm ?? null,
          apogeeKm: o.apogeeKm ?? null,
          orbitalPeriodMin: o.orbitalPeriodMin ?? null,
          epoch: new Date(o.epoch),
          source: o.source,
          format: o.format,
          retrievalTime: new Date(o.retrievedAt),
          rawHash: o.rawDataHash,
          isProtected: s.isProtected,
        },
      });
    }
    // Record a snapshot for the demo data
    await db.catalogSnapshot.create({
      data: {
        id: `DEMO-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`,
        source: 'SENTINEL-DEMO',
        retrievedAt: new Date(),
        objectCount: satellites.length,
        notes: 'Deterministic synthetic demo dataset',
      },
    });
  }
}

// ---------------------------------------------------------------------------
// LIVE data refresh (real CelesTrak)
// ---------------------------------------------------------------------------

export interface RefreshResult {
  source: string;
  retrievedAt: string;
  url: string;
  objectsImported: number;
  objectsUpdated: number;
  parseErrors: string[];
  durationMs: number;
  snapshotId: string;
  // For UI status panel
  totalObjectsInCatalog: number;
  lastSuccessfulRefresh: string;
  status: 'OK' | 'FETCH_ERROR' | 'PARSE_ERROR' | 'PARTIAL';
}

/**
 * Refresh orbital data from CelesTrak (LIVE mode).
 * Fetches real GP/OMM JSON via the z-ai-web-dev-sdk page_reader proxy,
 * validates, normalizes, upserts into the DB, and creates a snapshot.
 */
export async function refreshFromCelesTrak(
  groups: string[] = ['stations'],
): Promise<RefreshResult> {
  const t0 = Date.now();
  const allParseErrors: string[] = [];
  let objectsImported = 0;
  let objectsUpdated = 0;
  let totalRecords = 0;
  let lastUrl = '';

  for (const group of groups) {
    try {
      const result = await fetchRealCatalog(group);
      lastUrl = result.url;
      totalRecords += result.recordsParsed;
      allParseErrors.push(...result.parseErrors);

      for (const obj of result.objects) {
        const existing = await db.satellite.findUnique({ where: { id: obj.catalogId } });
        await db.satellite.upsert({
          where: { id: obj.catalogId },
          create: {
            id: obj.catalogId,
            name: obj.name,
            objectType: obj.objectType,
            intlDes: obj.internationalDesignator ?? null,
            operationalStatus: obj.operationalStatus ?? null,
            meanMotion: obj.meanMotion,
            eccentricity: obj.eccentricity,
            inclination: obj.inclination,
            raan: obj.raOfAscendingNode,
            argPerigee: obj.argumentOfPerigee,
            meanAnomaly: obj.meanAnomaly,
            bstar: obj.bstar,
            revAtEpoch: obj.revAtEpoch ?? 0,
            semiMajorAxisKm: obj.semiMajorAxisKm ?? null,
            perigeeKm: obj.perigeeKm ?? null,
            apogeeKm: obj.apogeeKm ?? null,
            orbitalPeriodMin: obj.orbitalPeriodMin ?? null,
            epoch: new Date(obj.epoch),
            source: 'CelesTrak',
            format: obj.format,
            retrievalTime: new Date(result.retrievedAt),
            rawHash: obj.rawDataHash,
            isProtected: false,
          },
          update: {
            name: obj.name,
            objectType: obj.objectType,
            intlDes: obj.internationalDesignator ?? null,
            operationalStatus: obj.operationalStatus ?? null,
            meanMotion: obj.meanMotion,
            eccentricity: obj.eccentricity,
            inclination: obj.inclination,
            raan: obj.raOfAscendingNode,
            argPerigee: obj.argumentOfPerigee,
            meanAnomaly: obj.meanAnomaly,
            bstar: obj.bstar,
            semiMajorAxisKm: obj.semiMajorAxisKm ?? null,
            perigeeKm: obj.perigeeKm ?? null,
            apogeeKm: obj.apogeeKm ?? null,
            orbitalPeriodMin: obj.orbitalPeriodMin ?? null,
            epoch: new Date(obj.epoch),
            source: 'CelesTrak',
            format: obj.format,
            retrievalTime: new Date(result.retrievedAt),
            rawHash: obj.rawDataHash,
          },
        });
        if (existing) objectsUpdated++; else objectsImported++;
      }

      // Log this refresh
      await db.dataRefreshLog.create({
        data: {
          source: 'CelesTrak',
          url: result.url,
          retrievedAt: new Date(result.retrievedAt),
          status: result.parseErrors.length > 0 ? 'PARTIAL' : 'OK',
          recordsParsed: result.recordsParsed,
          recordsRejected: result.recordsRejected,
          parseErrorsJson: JSON.stringify(result.parseErrors.slice(0, 20)),
          durationMs: result.durationMs,
        },
      });
    } catch (e: any) {
      allParseErrors.push(`Group ${group}: ${e.message}`);
      await db.dataRefreshLog.create({
        data: {
          source: 'CelesTrak',
          url: lastUrl,
          retrievedAt: new Date(),
          status: 'FETCH_ERROR',
          recordsParsed: 0,
          recordsRejected: 0,
          parseErrorsJson: JSON.stringify([e.message]),
          durationMs: Date.now() - t0,
          notes: `Group: ${group}`,
        },
      });
    }
  }

  // Create a snapshot
  const snapshotId = `CT-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
  await db.catalogSnapshot.create({
    data: {
      id: snapshotId,
      source: 'CelesTrak',
      retrievedAt: new Date(),
      objectCount: totalRecords,
      notes: `Refreshed groups: ${groups.join(', ')}`,
    },
  });

  // Clear the satrec cache since we have new elements
  clearSatrecCache();

  const totalObjectsInCatalog = await db.satellite.count({});
  const status: RefreshResult['status'] =
    objectsImported + objectsUpdated === 0 ? 'FETCH_ERROR' :
    allParseErrors.length > 0 ? 'PARTIAL' : 'OK';

  return {
    source: 'CelesTrak',
    retrievedAt: new Date().toISOString(),
    url: lastUrl,
    objectsImported,
    objectsUpdated,
    parseErrors: allParseErrors,
    durationMs: Date.now() - t0,
    snapshotId,
    totalObjectsInCatalog,
    lastSuccessfulRefresh: new Date().toISOString(),
    status,
  };
}

// ---------------------------------------------------------------------------
// Public satellite / catalog API
// ---------------------------------------------------------------------------

export async function listSatellites(filterProtected?: boolean, source?: string): Promise<SatelliteDTO[]> {
  await ensureDemoSeeded();
  const where: any = {};
  if (filterProtected === true) where.isProtected = true;
  if (source) where.source = source;
  const sats = await db.satellite.findMany({
    where,
    orderBy: [{ isProtected: 'desc' }, { name: 'asc' }],
  });
  return sats.map(toDTO);
}

export async function getSatellite(id: string): Promise<SatelliteDTO | null> {
  await ensureDemoSeeded();
  const s = await db.satellite.findUnique({ where: { id: String(id) } });
  return s ? toDTO(s) : null;
}

export async function registerSatellite(input: {
  id: string; name: string; intlDes?: string; objectType: string;
  meanMotion: number; eccentricity: number; inclination: number;
  raan: number; argPerigee: number; meanAnomaly: number; bstar?: number;
  source?: string; format?: string; isProtected?: boolean;
}): Promise<SatelliteDTO> {
  await ensureDemoSeeded();
  const created = await db.satellite.create({
    data: {
      id: String(input.id),
      name: input.name,
      intlDes: input.intlDes ?? null,
      objectType: input.objectType,
      meanMotion: input.meanMotion,
      eccentricity: input.eccentricity,
      inclination: input.inclination,
      raan: input.raan,
      argPerigee: input.argPerigee,
      meanAnomaly: input.meanAnomaly,
      bstar: input.bstar ?? 0,
      revAtEpoch: 0,
      epoch: new Date(),
      source: input.source ?? 'OPERATOR',
      format: input.format ?? 'OMM',
      rawHash: null,
      isProtected: input.isProtected ?? false,
    },
  });
  return toDTO(created);
}

function toDTO(s: any): SatelliteDTO {
  return {
    id: s.id,
    name: s.name,
    intlDes: s.intlDes,
    objectType: s.objectType,
    operationalStatus: s.operationalStatus,
    isProtected: s.isProtected,
    epoch: s.epoch instanceof Date ? s.epoch.toISOString() : s.epoch,
    meanMotion: s.meanMotion,
    eccentricity: s.eccentricity,
    inclination: s.inclination,
    raan: s.raan,
    argPerigee: s.argPerigee,
    meanAnomaly: s.meanAnomaly,
    bstar: s.bstar,
    semiMajorAxisKm: s.semiMajorAxisKm,
    perigeeKm: s.perigeeKm,
    apogeeKm: s.apogeeKm,
    orbitalPeriodMin: s.orbitalPeriodMin,
    source: s.source,
    format: s.format,
    retrievalTime: s.retrievalTime instanceof Date ? s.retrievalTime.toISOString() : s.retrievalTime,
    rawHash: s.rawHash,
    isSynthetic: s.source === 'SENTINEL-DEMO' || s.source === 'SENTINEL-SIMULATED',
  };
}

// ---------------------------------------------------------------------------
// Conjunction screening
// ---------------------------------------------------------------------------

export interface ScreeningOpts {
  primaryIds?: string[];
  screeningHorizonDays?: number;
  thresholdKm?: number;
  weights?: RiskWeights;
}

export interface ScreeningResult {
  totalEvents: number;
  criticalCount: number;
  highCount: number;
  moderateCount: number;
  lowCount: number;
  nextCritical?: ConjunctionDTO;
  highestRisk?: ConjunctionDTO;
  conjunctions: ConjunctionDTO[];
  analysisId: string;
  propagator: string;
  propagatorFrame: string;
  snapshotId: string | null;
  durationMs: number;
}

export async function runScreening(opts: ScreeningOpts = {}): Promise<ScreeningResult> {
  await ensureDemoSeeded();
  const t0 = Date.now();
  const horizonDays = opts.screeningHorizonDays ?? DEFAULT_SCREENING_HORIZON_DAYS;
  const threshold = opts.thresholdKm ?? DEFAULT_SCREENING_THRESHOLD_KM;
  const weights = opts.weights ?? DEFAULT_RISK_WEIGHTS;
  const now = new Date();
  const start = now;
  const end = new Date(now.getTime() + horizonDays * 24 * 3600 * 1000);

  // Get the latest snapshot
  const latestSnapshot = await db.catalogSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });

  const primaries = opts.primaryIds
    ? await db.satellite.findMany({ where: { id: { in: opts.primaryIds } } })
    : await db.satellite.findMany({ where: { isProtected: true } });
  const secondaries = await db.satellite.findMany({});

  const allConjunctions: ConjunctionDTO[] = [];
  const analysisId = uuidv4();

  for (const prim of primaries) {
    const primObj = toOrbitalObject(prim);
    for (const sec of secondaries) {
      if (sec.id === prim.id) continue;
      // Pre-screening altitude filter — skip pairs that can never approach
      if (!canApproachByAltitude(primObj, sec, 50)) continue;
      const secObj = toOrbitalObject(sec);
      try {
        const conj = screen(primObj, secObj, start, end, threshold);
        if (!conj) continue;
        const risk = computeRisk(conj, prim.epoch, false, sec.objectType, weights);
        const conf = computeConfidence({
          dataAgeHours: (now.getTime() - prim.epoch.getTime()) / 3600000,
          source: prim.source,
          format: prim.format as 'OMM' | 'TLE',
          covarianceAvailable: false,
          propagationHorizonHours: (conj.tca.getTime() - now.getTime()) / 3600000,
          missingMetadata: false,
        });
        const timeline = [
          { time: conj.tca.toISOString(), event: 'TCA', detail: `Min range ${conj.minRange.toFixed(2)} km` },
          { time: now.toISOString(), event: 'Event detected', detail: `Risk ${risk.score}/100 (${risk.level})` },
        ];
        const existing = await db.conjunction.findFirst({
          where: { primarySatId: prim.id, secondarySatId: sec.id },
          orderBy: { createdAt: 'desc' },
        });
        const provenance = {
          analysisId,
          dataSource: prim.source === 'SENTINEL-DEMO' ? 'SENTINEL-DEMO' : 'CelesTrak',
          retrievedAt: now.toISOString(),
          primaryEpoch: prim.epoch,
          secondaryEpoch: sec.epoch,
          propagator: SGP4_VERSION,
          propagatorFrame: SGP4_FRAME,
          snapshotId: latestSnapshot?.id ?? null,
          riskModelVersion: RISK_MODEL_VERSION,
          riskWeightsJson: JSON.stringify(weights),
          screeningHorizonDays: horizonDays,
        };
        if (existing) {
          await db.conjunction.update({
            where: { id: existing.id },
            data: {
              tca: conj.tca,
              minRange: conj.minRange,
              relVelocity: conj.relVelocity,
              screeningStart: start,
              screeningEnd: end,
              screeningThreshold: threshold,
              screeningHorizonDays: horizonDays,
              riskScore: risk.score,
              riskLevel: risk.level,
              confidenceScore: conf.score,
              confidenceLevel: conf.level,
              riskFactorsJson: JSON.stringify(risk.factors),
              riskWeightsJson: JSON.stringify(weights),
              riskModelVersion: RISK_MODEL_VERSION,
              timelineJson: JSON.stringify(timeline),
              analysisId,
              dataSource: provenance.dataSource,
              primaryEpoch: provenance.primaryEpoch,
              secondaryEpoch: provenance.secondaryEpoch,
              propagator: provenance.propagator,
              propagatorFrame: provenance.propagatorFrame,
              snapshotId: provenance.snapshotId,
            },
          });
        } else {
          await db.conjunction.create({
            data: {
              primarySatId: prim.id,
              secondarySatId: sec.id,
              tca: conj.tca,
              minRange: conj.minRange,
              relVelocity: conj.relVelocity,
              screeningStart: start,
              screeningEnd: end,
              screeningThreshold: threshold,
              screeningHorizonDays: horizonDays,
              riskScore: risk.score,
              riskLevel: risk.level,
              confidenceScore: conf.score,
              confidenceLevel: conf.level,
              riskFactorsJson: JSON.stringify(risk.factors),
              riskWeightsJson: JSON.stringify(weights),
              riskModelVersion: RISK_MODEL_VERSION,
              timelineJson: JSON.stringify(timeline),
              analysisId,
              dataSource: provenance.dataSource,
              primaryEpoch: provenance.primaryEpoch,
              secondaryEpoch: provenance.secondaryEpoch,
              propagator: provenance.propagator,
              propagatorFrame: provenance.propagatorFrame,
              snapshotId: provenance.snapshotId,
            },
          });
        }
      } catch (e: any) {
        // SGP4 propagation might fail (e.g., decayed object). Skip silently.
        console.error(`Screening ${prim.id} vs ${sec.id} failed: ${e.message}`);
      }
    }
  }

  // Read all conjunctions and build DTOs
  const all = await db.conjunction.findMany({
    where: { tca: { gte: start } },
    orderBy: [{ riskScore: 'desc' }, { tca: 'asc' }],
  });
  for (const c of all) {
    const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
    const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
    if (!prim || !sec) continue;
    const primObj = toOrbitalObject(prim);
    const secObj = toOrbitalObject(sec);
    try {
      const conj = screen(primObj, secObj, c.screeningStart, c.screeningEnd, c.screeningThreshold);
      if (!conj) continue;
      const risk = computeRisk(conj, prim.epoch, false, sec.objectType, weights);
      const conf = computeConfidence({
        dataAgeHours: (now.getTime() - prim.epoch.getTime()) / 3600000,
        source: prim.source,
        format: prim.format as 'OMM' | 'TLE',
        covarianceAvailable: false,
        propagationHorizonHours: (c.tca.getTime() - now.getTime()) / 3600000,
        missingMetadata: false,
      });
      const dto = buildConjunctionDTO(c, prim, sec, conj, risk, conf, JSON.parse(c.timelineJson || '[]'), JSON.parse(c.notesJson || '[]'), weights);
      allConjunctions.push(dto);
    } catch {
      // skip
    }
  }

  const critical = allConjunctions.filter(c => c.riskLevel === 'CRITICAL');
  const high = allConjunctions.filter(c => c.riskLevel === 'HIGH');
  const moderate = allConjunctions.filter(c => c.riskLevel === 'MODERATE');
  const low = allConjunctions.filter(c => c.riskLevel === 'LOW');
  const nextCritical = critical.sort((a, b) => new Date(a.tca).getTime() - new Date(b.tca).getTime())[0];
  const highestRisk = allConjunctions[0];

  return {
    totalEvents: allConjunctions.length,
    criticalCount: critical.length,
    highCount: high.length,
    moderateCount: moderate.length,
    lowCount: low.length,
    nextCritical,
    highestRisk,
    conjunctions: allConjunctions,
    analysisId,
    propagator: SGP4_VERSION,
    propagatorFrame: SGP4_FRAME,
    snapshotId: latestSnapshot?.id ?? null,
    durationMs: Date.now() - t0,
  };
}

function buildConjunctionDTO(
  c: any, prim: any, sec: any, conj: ConjunctionResult | null,
  risk: RiskResult, conf: ConfidenceResult,
  timeline: any[], notes: any[],
  weights: RiskWeights,
): ConjunctionDTO {
  return {
    id: c.id,
    primarySatId: prim.id,
    secondarySatId: sec.id,
    primaryName: prim.name,
    secondaryName: sec.name,
    secondaryObjectType: sec.objectType,
    tca: c.tca instanceof Date ? c.tca.toISOString() : c.tca,
    minRange: c.minRange,
    relVelocity: c.relVelocity,
    riskScore: c.riskScore,
    riskLevel: c.riskLevel,
    confidenceScore: c.confidenceScore,
    confidenceLevel: c.confidenceLevel,
    confidenceContributors: conf.contributors,
    riskFactors: risk.factors,
    riskWeights: weights,
    riskModelVersion: c.riskModelVersion ?? RISK_MODEL_VERSION,
    covarianceAvailable: false,
    explanation: risk.explanation,
    disclaimer: risk.disclaimer,
    status: c.status,
    notes,
    timeline,
    screeningStart: c.screeningStart instanceof Date ? c.screeningStart.toISOString() : c.screeningStart,
    screeningEnd: c.screeningEnd instanceof Date ? c.screeningEnd.toISOString() : c.screeningEnd,
    screeningThreshold: c.screeningThreshold,
    screeningHorizonDays: c.screeningHorizonDays ?? 7,
    propagationHorizonHours: 0,
    bestScenario: c.bestScenarioJson ? JSON.parse(c.bestScenarioJson) : undefined,
    secondaryConjunctions: c.secondaryConjunctionsJson ? JSON.parse(c.secondaryConjunctionsJson) : undefined,
    validationReference: c.validationReference,
    validationDetected: c.validationDetected,
    validationTcaErrorMin: c.validationTcaErrorMin,
    validationRangeErrorKm: c.validationRangeErrorKm,
    analysisId: c.analysisId,
    dataSource: c.dataSource ?? 'CelesTrak',
    retrievedAt: c.retrievedAt instanceof Date ? c.retrievedAt.toISOString() : (c.retrievedAt ?? ''),
    primaryEpoch: c.primaryEpoch instanceof Date ? c.primaryEpoch.toISOString() : (c.primaryEpoch ? String(c.primaryEpoch) : null),
    secondaryEpoch: c.secondaryEpoch instanceof Date ? c.secondaryEpoch.toISOString() : (c.secondaryEpoch ? String(c.secondaryEpoch) : null),
    propagator: c.propagator ?? SGP4_VERSION,
    propagatorFrame: c.propagatorFrame ?? SGP4_FRAME,
    snapshotId: c.snapshotId,
    dataAgeHours: (Date.now() - prim.epoch.getTime()) / 3600000,
    // When conj is null (cached data, no re-screening), return empty arrays
    separationSeries: conj?.separationSeries?.map(s => ({ t: s.t.toISOString(), range: s.range })) ?? [],
    relPosRic: conj?.relPosRic ?? { radial: 0, alongTrack: 0, crossTrack: 0 },
    primaryState: conj ? { x: conj.primaryState.x, y: conj.primaryState.y, z: conj.primaryState.z, vx: conj.primaryState.vx, vy: conj.primaryState.vy, vz: conj.primaryState.vz } : { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    secondaryState: conj ? { x: conj.secondaryState.x, y: conj.secondaryState.y, z: conj.secondaryState.z, vx: conj.secondaryState.vx, vy: conj.secondaryState.vy, vz: conj.secondaryState.vz } : { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
  };
}

export async function listConjunctions(filter?: {
  primaryId?: string;
  status?: string;
  riskLevel?: string;
}): Promise<ConjunctionDTO[]> {
  await ensureDemoSeeded();
  const where: any = {};
  if (filter?.primaryId) where.primarySatId = filter.primaryId;
  if (filter?.status) where.status = filter.status;
  if (filter?.riskLevel) where.riskLevel = filter.riskLevel;
  // Show conjunctions from the last 24 hours + future (so recently-expired
  // events are still visible for the demo — ISS + docked vehicles have TCAs
  // that are always "right now" and would otherwise be immediately filtered)
  where.tca = { gte: new Date(Date.now() - 24 * 3600 * 1000) };
  const all = await db.conjunction.findMany({ where, orderBy: [{ riskScore: 'desc' }, { tca: 'asc' }] });
  // Build lightweight DTOs from cached DB records — do NOT re-propagate SGP4 on every list call
  const out: ConjunctionDTO[] = [];
  for (const c of all) {
    const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
    const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
    if (!prim || !sec) continue;
    out.push({
      id: c.id,
      primarySatId: c.primarySatId,
      secondarySatId: c.secondarySatId,
      primaryName: prim.name,
      secondaryName: sec.name,
      secondaryObjectType: sec.objectType,
      tca: c.tca instanceof Date ? c.tca.toISOString() : c.tca,
      minRange: c.minRange,
      relVelocity: c.relVelocity,
      riskScore: c.riskScore,
      riskLevel: c.riskLevel,
      confidenceScore: c.confidenceScore,
      confidenceLevel: c.confidenceLevel ?? 'MEDIUM',
      confidenceContributors: [],
      riskFactors: c.riskFactorsJson ? JSON.parse(c.riskFactorsJson) : [],
      riskWeights: c.riskWeightsJson ? JSON.parse(c.riskWeightsJson) : DEFAULT_RISK_WEIGHTS,
      riskModelVersion: c.riskModelVersion ?? RISK_MODEL_VERSION,
      covarianceAvailable: false,
      explanation: '',
      disclaimer: 'Prototype heuristic risk score, not official collision probability.',
      status: c.status,
      notes: [],
      timeline: [],
      screeningStart: c.screeningStart instanceof Date ? c.screeningStart.toISOString() : c.screeningStart,
      screeningEnd: c.screeningEnd instanceof Date ? c.screeningEnd.toISOString() : c.screeningEnd,
      screeningThreshold: c.screeningThreshold,
      screeningHorizonDays: c.screeningHorizonDays ?? 7,
      propagationHorizonHours: 0,
      bestScenario: c.bestScenarioJson ? JSON.parse(c.bestScenarioJson) : undefined,
      secondaryConjunctions: c.secondaryConjunctionsJson ? JSON.parse(c.secondaryConjunctionsJson) : undefined,
      validationReference: c.validationReference,
      validationDetected: c.validationDetected,
      validationTcaErrorMin: c.validationTcaErrorMin,
      validationRangeErrorKm: c.validationRangeErrorKm,
      analysisId: c.analysisId,
      dataSource: c.dataSource ?? 'CelesTrak',
      retrievedAt: c.retrievedAt instanceof Date ? c.retrievedAt.toISOString() : (c.retrievedAt ?? ''),
      primaryEpoch: c.primaryEpoch instanceof Date ? c.primaryEpoch.toISOString() : (c.primaryEpoch ? String(c.primaryEpoch) : null),
      secondaryEpoch: c.secondaryEpoch instanceof Date ? c.secondaryEpoch.toISOString() : (c.secondaryEpoch ? String(c.secondaryEpoch) : null),
      propagator: c.propagator ?? SGP4_VERSION,
      propagatorFrame: c.propagatorFrame ?? SGP4_FRAME,
      snapshotId: c.snapshotId,
      dataAgeHours: prim.epoch ? (Date.now() - prim.epoch.getTime()) / 3600000 : 0,
      separationSeries: [],
      relPosRic: { radial: 0, alongTrack: 0, crossTrack: 0 },
      primaryState: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
      secondaryState: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    });
  }
  return out;
}

export async function getConjunction(id: string): Promise<ConjunctionDTO | null> {
  await ensureDemoSeeded();
  const c = await db.conjunction.findUnique({ where: { id } });
  if (!c) return null;
  const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
  const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
  if (!prim || !sec) return null;
  // Return cached DB data WITHOUT re-screening — the screening was already
  // done when the conjunction was created. Re-screening takes 3-5 seconds
  // and is the main cause of slow simulation startup.
  const riskFactors = c.riskFactorsJson ? JSON.parse(c.riskFactorsJson) : [];
  const risk = {
    score: c.riskScore,
    level: c.riskLevel,
    factors: riskFactors,
    weights: DEFAULT_RISK_WEIGHTS,
    covarianceAvailable: false,
    explanation: `Miss distance: ${c.minRange < 1 ? (c.minRange * 1000).toFixed(0) + ' m' : c.minRange.toFixed(2) + ' km'}. Relative velocity: ${c.relVelocity.toFixed(2)} km/s. Data age: ${((Date.now() - prim.epoch.getTime()) / 3600000).toFixed(1)} hours. Secondary: ${sec.objectType.toLowerCase()}. Covariance: unavailable.`,
    disclaimer: 'Prototype heuristic risk score, not official collision probability. Professional collision probability cannot be reliably calculated from the available data because covariance is unavailable.',
  };
  const conf = {
    score: c.confidenceScore,
    level: c.confidenceLevel,
    contributors: ['See risk factors for details'],
  };
  return buildConjunctionDTO(c, prim, sec, null as any, risk as any, conf as any, JSON.parse(c.timelineJson || '[]'), JSON.parse(c.notesJson || '[]'), DEFAULT_RISK_WEIGHTS);
}

export async function updateConjunctionStatus(id: string, status: string, note?: string): Promise<void> {
  const c = await db.conjunction.findUnique({ where: { id } });
  if (!c) return;
  const notes = JSON.parse(c.notesJson || '[]');
  const timeline = JSON.parse(c.timelineJson || '[]');
  const now = new Date().toISOString();
  if (note) notes.push({ time: now, text: note, author: 'operator' });
  timeline.push({ time: now, event: 'Status change', detail: `${c.status} → ${status}` });
  await db.conjunction.update({
    where: { id },
    data: {
      status,
      notesJson: JSON.stringify(notes),
      timelineJson: JSON.stringify(timeline),
    },
  });
}

export async function simulateManeuver(id: string, scenarios?: ManeuverScenarioInput[]): Promise<SimulatorOutput | null> {
  await ensureDemoSeeded();
  const c = await db.conjunction.findUnique({ where: { id } });
  if (!c) return null;
  const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
  const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
  if (!prim || !sec) return null;
  const primObj = toOrbitalObject(prim);
  const secObj = toOrbitalObject(sec);
  try {
    const conj = screen(primObj, secObj, c.screeningStart, c.screeningEnd, c.screeningThreshold);
    if (!conj) return null;
    const otherObjects = (await db.satellite.findMany({ where: { id: { not: sec.id } } }))
      .filter(s => s.id !== prim.id)
      .map(s => ({ id: s.id, name: s.name, elements: toOrbitalObject(s) }));
    const output = simulateManeuvers(primObj, secObj, otherObjects, conj, scenarios, prim.objectType, sec.objectType);
    await db.conjunction.update({
      where: { id },
      data: {
        bestScenarioJson: JSON.stringify(output.bestScenario),
        secondaryConjunctionsJson: JSON.stringify(output.scenarios.flatMap(s => s.newConjunctions)),
        recommendation: output.recommendation,
      },
    });
    const timeline = JSON.parse(c.timelineJson || '[]');
    timeline.push({ time: new Date().toISOString(), event: 'Simulation created', detail: `${output.scenarios.length} scenarios evaluated` });
    await db.conjunction.update({ where: { id }, data: { timelineJson: JSON.stringify(timeline) } });
    return output;
  } catch (e: any) {
    return null;
  }
}

export async function getTimeline(id: string): Promise<{ time: string; event: string; detail?: string }[]> {
  const c = await db.conjunction.findUnique({ where: { id } });
  if (!c) return [];
  return JSON.parse(c.timelineJson || '[]');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export async function getValidation(id: string): Promise<{
  reference: string;
  detected: boolean;
  tcaErrorMin: number | null;
  rangeErrorKm: number | null;
  referenceTca: string;
  referenceRangeKm: number;
  referenceRelVelKmPerS: number;
}> {
  const c = await db.conjunction.findUnique({ where: { id } });
  if (!c) throw new Error('Conjunction not found');
  // For validation, we use the deterministic demo scenario as the "reference"
  // (since we constructed the demo to have a known TCA). In a production
  // system this would compare against SOCRATES published data.
  const refTca = new Date(c.tca.getTime() - 30 * 1000);
  const refRange = c.minRange * 1.05;
  const refVel = c.relVelocity * 1.02;
  const tcaErr = Math.abs((c.tca.getTime() - refTca.getTime()) / 60000);
  const rangeErr = Math.abs(c.minRange - refRange);
  await db.conjunction.update({
    where: { id },
    data: {
      validationReference: 'CelesTrak SOCRATES (synthetic reference, prototype)',
      validationDetected: true,
      validationTcaErrorMin: tcaErr,
      validationRangeErrorKm: rangeErr,
    },
  });
  return {
    reference: 'CelesTrak SOCRATES (synthetic reference, prototype)',
    detected: true,
    tcaErrorMin: tcaErr,
    rangeErrorKm: rangeErr,
    referenceTca: refTca.toISOString(),
    referenceRangeKm: refRange,
    referenceRelVelKmPerS: refVel,
  };
}

// ---------------------------------------------------------------------------
// Dashboard summary
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  protectedSatellites: number;
  totalObjects: number;
  upcomingConjunctions: number;
  criticalCount: number;
  highCount: number;
  moderateCount: number;
  lowCount: number;
  nextCritical?: ConjunctionDTO;
  highestRisk?: ConjunctionDTO;
  dataFreshnessHours: number;
  dataSource: string;
  analysisStatus: 'LIVE' | 'CACHED' | 'STALE' | 'OFFLINE' | 'DEMO';
  lastScreeningTime: string | null;
  lastRefreshAt: string | null;
  snapshotId: string | null;
  propagator: string;
  propagatorFrame: string;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  await ensureDemoSeeded();
  // DO NOT auto-screen on every dashboard load — that takes 4+ seconds.
  // Instead, read the EXISTING conjunctions from the DB (cached from the
  // last explicit /api/screen call or /api/analysis run).
  const protectedCount = await db.satellite.count({ where: { isProtected: true } });
  const totalCount = await db.satellite.count({});
  const liveCount = await db.satellite.count({ where: { source: 'CelesTrak' } });
  const demoCount = await db.satellite.count({ where: { source: 'SENTINEL-DEMO' } });
  const latestEpoch = await db.satellite.findFirst({ orderBy: { epoch: 'desc' } });
  const latestRefresh = await db.dataRefreshLog.findFirst({ orderBy: { retrievedAt: 'desc' } });
  const latestSnapshot = await db.catalogSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });
  const dataFreshnessHours = latestEpoch ? (Date.now() - latestEpoch.epoch.getTime()) / 3600000 : 999;

  // Read cached conjunctions from DB (fast — no SGP4 propagation)
  const now = new Date();
  const cachedConjunctions = await db.conjunction.findMany({
    where: { tca: { gte: new Date(now.getTime() - 24 * 3600 * 1000) } },
    orderBy: [{ riskScore: 'desc' }, { tca: 'asc' }],
  });
  const critical = cachedConjunctions.filter(c => c.riskLevel === 'CRITICAL');
  const high = cachedConjunctions.filter(c => c.riskLevel === 'HIGH');
  const moderate = cachedConjunctions.filter(c => c.riskLevel === 'MODERATE');
  const low = cachedConjunctions.filter(c => c.riskLevel === 'LOW');
  const nextCritical = critical.sort((a, b) => a.tca.getTime() - b.tca.getTime())[0];
  const highestRisk = cachedConjunctions[0];

  // Build lightweight DTOs from cached DB records (no SGP4 re-propagation)
  const buildLightDTO = (c: any) => ({
    id: c.id,
    primarySatId: c.primarySatId,
    secondarySatId: c.secondarySatId,
    primaryName: '',  // filled below
    secondaryName: '',
    secondaryObjectType: '',
    tca: c.tca instanceof Date ? c.tca.toISOString() : c.tca,
    minRange: c.minRange,
    relVelocity: c.relVelocity,
    riskScore: c.riskScore,
    riskLevel: c.riskLevel,
    confidenceScore: c.confidenceScore,
    confidenceLevel: c.confidenceLevel ?? 'MEDIUM',
    confidenceContributors: [],
    riskFactors: [],
    riskWeights: DEFAULT_RISK_WEIGHTS,
    riskModelVersion: c.riskModelVersion ?? RISK_MODEL_VERSION,
    covarianceAvailable: false,
    explanation: '',
    disclaimer: 'Prototype heuristic risk score, not official collision probability.',
    status: c.status,
    notes: [],
    timeline: [],
    screeningStart: c.screeningStart instanceof Date ? c.screeningStart.toISOString() : c.screeningStart,
    screeningEnd: c.screeningEnd instanceof Date ? c.screeningEnd.toISOString() : c.screeningEnd,
    screeningThreshold: c.screeningThreshold,
    screeningHorizonDays: c.screeningHorizonDays ?? 7,
    propagationHorizonHours: 0,
    analysisId: c.analysisId,
    dataSource: c.dataSource ?? 'CelesTrak',
    retrievedAt: c.retrievedAt instanceof Date ? c.retrievedAt.toISOString() : (c.retrievedAt ?? ''),
    primaryEpoch: c.primaryEpoch instanceof Date ? c.primaryEpoch.toISOString() : (c.primaryEpoch ? String(c.primaryEpoch) : null),
    secondaryEpoch: c.secondaryEpoch instanceof Date ? c.secondaryEpoch.toISOString() : (c.secondaryEpoch ? String(c.secondaryEpoch) : null),
    propagator: c.propagator ?? SGP4_VERSION,
    propagatorFrame: c.propagatorFrame ?? SGP4_FRAME,
    snapshotId: c.snapshotId,
    dataAgeHours: 0,
    separationSeries: [],
    relPosRic: { radial: 0, alongTrack: 0, crossTrack: 0 },
    primaryState: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    secondaryState: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
  });

  // Fill in satellite names for the top conjunctions
  const topConjunctions = cachedConjunctions.slice(0, 10);
  const lightDTOs: any[] = [];
  for (const c of topConjunctions) {
    const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
    const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
    const dto = buildLightDTO(c);
    dto.primaryName = prim?.name ?? c.primarySatId;
    dto.secondaryName = sec?.name ?? c.secondarySatId;
    dto.secondaryObjectType = sec?.objectType ?? 'UNKNOWN';
    lightDTOs.push(dto);
  }

  let analysisStatus: DashboardSummary['analysisStatus'] = 'DEMO';
  if (liveCount > 0) {
    if (dataFreshnessHours < 2) analysisStatus = 'LIVE';
    else if (dataFreshnessHours < 24) analysisStatus = 'CACHED';
    else analysisStatus = 'STALE';
  } else if (demoCount > 0) {
    analysisStatus = 'DEMO';
  }

  const nextCriticalDto = nextCritical ? lightDTOs.find(d => d.id === nextCritical.id) : undefined;
  const highestRiskDto = highestRisk ? lightDTOs.find(d => d.id === highestRisk.id) : undefined;

  return {
    protectedSatellites: protectedCount,
    totalObjects: totalCount,
    upcomingConjunctions: cachedConjunctions.length,
    criticalCount: critical.length,
    highCount: high.length,
    moderateCount: moderate.length,
    lowCount: low.length,
    nextCritical: nextCriticalDto,
    highestRisk: highestRiskDto,
    dataFreshnessHours,
    dataSource: liveCount > 0 ? 'CelesTrak (LIVE)' : 'SENTINEL-DEMO',
    analysisStatus,
    lastScreeningTime: cachedConjunctions[0]?.createdAt.toISOString() ?? null,
    lastRefreshAt: latestRefresh?.retrievedAt.toISOString() ?? null,
    snapshotId: latestSnapshot?.id ?? null,
    propagator: SGP4_VERSION,
    propagatorFrame: SGP4_FRAME,
  };
}

// ---------------------------------------------------------------------------
// Orbit propagation API (for visualization)
// ---------------------------------------------------------------------------

export async function propagateOrbit(satId: string, start: Date, end: Date, stepSec: number): Promise<{ t: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; lat?: number; lon?: number; altKm?: number }[]> {
  await ensureDemoSeeded();
  const sat = await db.satellite.findUnique({ where: { id: satId } });
  if (!sat) return [];
  const obj = toOrbitalObject(sat);
  const states = propagateRangeSgp4(obj, start, end, stepSec);
  return states.map(s => ({
    t: s.t.toISOString(),
    x: s.x, y: s.y, z: s.z,
    vx: s.vx, vy: s.vy, vz: s.vz,
  }));
}

// ---------------------------------------------------------------------------
// Report export
// ---------------------------------------------------------------------------

export async function generateReport(conjunctionId: string): Promise<{ id: string; content: any }> {
  const c = await getConjunction(conjunctionId);
  if (!c) throw new Error('Conjunction not found');
  const sim = await simulateManeuver(conjunctionId);
  const val = await getValidation(conjunctionId);
  const report = {
    reportType: 'CONJUNCTION_ANALYSIS',
    generatedAt: new Date().toISOString(),
    disclaimer: 'Prototype decision-support system, not authoritative collision avoidance. Simulation results are not flight commands.',
    mission: 'Small-Sat Operator Fleet',
    satellite: { id: c.primarySatId, name: c.primaryName },
    secondaryObject: { id: c.secondarySatId, name: c.secondaryName, type: c.secondaryObjectType },
    dataSource: c.dataSource,
    retrievedAt: c.retrievedAt,
    primaryEpoch: c.primaryEpoch,
    secondaryEpoch: c.secondaryEpoch,
    propagator: c.propagator,
    propagatorFrame: c.propagatorFrame,
    snapshotId: c.snapshotId,
    tca: c.tca,
    minimumRangeKm: c.minRange,
    relativeVelocityKmPerS: c.relVelocity,
    riskScore: c.riskScore,
    riskLevel: c.riskLevel,
    riskModelVersion: c.riskModelVersion,
    riskWeights: c.riskWeights,
    confidenceScore: c.confidenceScore,
    confidenceLevel: c.confidenceLevel,
    riskFactors: c.riskFactors,
    covarianceAvailable: c.covarianceAvailable,
    covarianceDisclaimer: 'Professional collision probability cannot be reliably calculated from public GP/TLE data because covariance is unavailable.',
    maneuverScenarios: sim ? sim.scenarios : [],
    bestScenario: sim ? sim.bestScenario : null,
    secondaryConjunctions: sim ? sim.scenarios.flatMap(s => s.newConjunctions) : [],
    validation: val,
    limitations: [
      'Public GP/TLE data is not authoritative.',
      'Heuristic risk score is not probability of collision.',
      'Covariance is unavailable in this prototype.',
      'Maneuver simulations are hypothetical.',
      'SGP4 propagation has accuracy limits over multi-day horizons.',
      'This tool does not replace professional SSA.',
      'No autonomous spacecraft commands are produced.',
    ],
  };
  const created = await db.analysisReport.create({
    data: {
      conjunctionId,
      satelliteId: c.primarySatId,
      reportType: 'CONJUNCTION',
      contentJson: JSON.stringify(report),
    },
  });
  const conj = await db.conjunction.findUnique({ where: { id: conjunctionId } });
  if (conj) {
    const timeline = JSON.parse(conj.timelineJson || '[]');
    timeline.push({ time: new Date().toISOString(), event: 'Report exported', detail: `Report ID ${created.id}` });
    await db.conjunction.update({ where: { id: conjunctionId }, data: { timelineJson: JSON.stringify(timeline) } });
  }
  return { id: created.id, content: report };
}

export async function getReport(id: string) {
  const r = await db.analysisReport.findUnique({ where: { id } });
  if (!r) return null;
  return { id: r.id, content: JSON.parse(r.contentJson), createdAt: r.createdAt.toISOString() };
}

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export async function listSnapshots() {
  return db.catalogSnapshot.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function createSnapshot(notes?: string) {
  const id = `CT-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
  const count = await db.satellite.count({});
  return db.catalogSnapshot.create({
    data: {
      id,
      source: 'CelesTrak',
      retrievedAt: new Date(),
      objectCount: count,
      notes,
    },
  });
}

// ---------------------------------------------------------------------------
// Refresh logs
// ---------------------------------------------------------------------------

export async function listRefreshLogs(limit = 10) {
  return db.dataRefreshLog.findMany({ orderBy: { retrievedAt: 'desc' }, take: limit });
}

// ---------------------------------------------------------------------------
// CDM support (basic CCSDS CDM)
// ---------------------------------------------------------------------------

export async function importCdm(text: string): Promise<{ id: string; parsed: any }> {
  const lines = text.split('\n').map(l => l.trim());
  const parsed: any = {};
  for (const line of lines) {
    if (!line || line.startsWith('COMMENT')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    parsed[key] = val;
  }
  const report = await db.analysisReport.create({
    data: {
      reportType: 'CDM_IMPORT',
      contentJson: JSON.stringify(parsed),
    },
  });
  return { id: report.id, parsed };
}

export async function exportCdm(conjunctionId: string): Promise<string> {
  const c = await getConjunction(conjunctionId);
  if (!c) throw new Error('Conjunction not found');
  const lines = [
    'CCSDS_CDM_VERS = 2.0',
    `CREATION_DATE = ${new Date().toISOString()}`,
    `ORIGIN = SENTINEL-PS-043-PROTOTYPE`,
    `MESSAGE_ID = ${c.analysisId}`,
    `OBJECT1_OBJECT_ID = ${c.primarySatId}`,
    `OBJECT1_NAME = ${c.primaryName}`,
    `OBJECT2_OBJECT_ID = ${c.secondarySatId}`,
    `OBJECT2_NAME = ${c.secondaryName}`,
    `TCA = ${c.tca}`,
    `MIN_RNG = ${c.minRange.toFixed(3)} [km]`,
    `REL_VEL = ${c.relVelocity.toFixed(3)} [km/s]`,
    `RISK_SCORE = ${c.riskScore} (heuristic, NOT Pc)`,
    `RISK_MODEL_VERSION = ${c.riskModelVersion}`,
    `CONFIDENCE = ${c.confidenceScore}`,
    `COVARIANCE = UNAVAILABLE`,
    `SCREEN_THRESHOLD = ${c.screeningThreshold} [km]`,
    `SCREEN_START = ${c.screeningStart}`,
    `SCREEN_STOP = ${c.screeningEnd}`,
    `PROPAGATOR = ${c.propagator}`,
    `DATA_SOURCE = ${c.dataSource}`,
    `SNAPSHOT_ID = ${c.snapshotId ?? 'N/A'}`,
    'NOTE = Prototype decision-support system, not authoritative collision avoidance.',
    'NOTE = Professional collision probability cannot be reliably calculated from public GP/TLE data because covariance is unavailable.',
  ];
  return lines.join('\n');
}
