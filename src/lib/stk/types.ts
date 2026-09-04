// Types for the STK (Ansys Systems Tool Kit) integration.
//
// STK is a proprietary orbital simulation application from Ansys/AGI.
// It provides:
//   - High-fidelity SGP4 / SGP4-XL / special perturbations propagators
//   - Advanced CAT (Conjunction Analysis Tools) for close-approach screening
//   - 3D visualization (globe + trajectories + close-approach vectors)
//   - Optional covariance-based collision probability (when licensed + data available)
//
// This module defines the TypeScript interface that the rest of SENTINEL uses
// to talk to STK. The actual STK connection happens via the Connect command
// protocol (TCP socket) — see `client.ts`. When STK is unavailable, the
// `fallback.ts` module provides an SGP4-based simulation that implements the
// same interface, so the rest of the application is unchanged.
//
// References:
//   - STK Advanced CAT: https://help.agi.com/stk/Content/cat/Cat03.htm
//   - STK Connect commands: https://help.agi.com/stk/Subsystems/connect/Content/start.htm
//   - STK Python API: https://help.agi.com/stkdevkit/Content/python/pythonIntro.htm

/** STK availability / health-check result. */
export interface StkStatus {
  available: boolean;
  version: string | null;
  connectPortOpen: boolean;
  pythonApiAvailable: boolean;
  advancedCatAvailable: boolean;
  reason?: string;          // human-readable reason if unavailable
  detectedAt: string;       // ISO 8601 UTC
}

/** A candidate object to send to STK for Advanced CAT analysis. */
export interface StkSecondaryCandidate {
  catalogId: string;
  name: string;
  objectType: string;
  epoch: string;            // ISO 8601 UTC
  meanMotion: number;       // rev/day
  eccentricity: number;
  inclination: number;      // deg
  raOfAscendingNode: number; // deg
  argumentOfPerigee: number; // deg
  meanAnomaly: number;      // deg
  bstar: number;
  source: string;           // 'CelesTrak' | 'SENTINEL-DEMO'
}

/** The primary satellite for an STK scenario. */
export interface StkPrimary extends StkSecondaryCandidate {
  isProtected: boolean;
}

/** Configuration for an STK scenario + Advanced CAT analysis. */
export interface StkScenarioConfig {
  scenarioName: string;
  analysisStart: string;    // ISO 8601 UTC
  analysisEnd: string;      // ISO 8601 UTC
  thresholdKm: number;      // default 5 km
  primary: StkPrimary;
  secondaries: StkSecondaryCandidate[];
  // Reporting options
  reportTrajectory: boolean;   // generate trajectory samples for viz
  trajectoryStepSec: number;   // step size for trajectory samples
}

/** A single point in a propagated trajectory. */
export interface TrajectoryPoint {
  t: string;                // ISO 8601 UTC
  x: number; y: number; z: number;  // km, TEME frame
  vx: number; vy: number; vz: number; // km/s
}

/** A conjunction result from STK Advanced CAT. */
export interface StkConjunctionResult {
  engine: 'STK Advanced CAT' | 'SENTINEL SGP4 (fallback)';
  engineVersion: string;
  primary: { catalogId: string; name: string; };
  secondary: { catalogId: string; name: string; objectType: string; };
  tca: string;              // ISO 8601 UTC
  minimumRangeKm: number;
  minimumSeparationKm: number;  // alias for minimumRangeKm (in 3D)
  relativeVelocityKmPerSec: number;
  thresholdKm: number;
  analysisStart: string;
  analysisEnd: string;
  // Trajectories for visualization
  primaryTrajectory: TrajectoryPoint[];
  secondaryTrajectory: TrajectoryPoint[];
  separationSeries: { t: string; range: number }[];
  // Provenance
  stkScenarioId?: string;
  stkAnalysisId?: string;
  stkResultTimestamp?: string;
  stkRawReportHash?: string;
  stkVersion?: string;
  // Covariance / probability (only if inputs are scientifically valid)
  covarianceAvailable: boolean;
  collisionProbabilityAvailable: boolean;
  collisionProbability?: number;  // 0..1, only if available
  // Error / fallback info
  fallbackReason?: string;  // populated if engine === 'SENTINEL SGP4 (fallback)'
}

/** Comparison between SENTINEL SGP4, STK, and SOCRATES (if available). */
export interface EngineComparison {
  sentinel: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number; };
  stk: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  socrates: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  // Differences (STK vs SENTINEL)
  tcaDifferenceSec: number | null;
  rangeDifferenceKm: number | null;
}

/** Status of a simulation run (background job). */
export type SimulationStatus =
  | 'QUEUED'
  | 'STARTING_STK'
  | 'LOADING_DATA'
  | 'PROPAGATING'
  | 'RUNNING_CAT'
  | 'EXTRACTING_RESULTS'
  | 'COMPLETE'
  | 'FAILED'
  | 'STK_UNAVAILABLE';

export interface SimulationRun {
  id: string;
  conjunctionId: string;
  engine: 'STK Advanced CAT' | 'SENTINEL SGP4 (fallback)';
  engineVersion: string;
  status: SimulationStatus;
  startedAt: string;
  completedAt: string | null;
  scenarioId: string | null;
  analysisStart: string;
  analysisEnd: string;
  thresholdKm: number;
  resultJson: string | null;       // full StkConjunctionResult JSON
  rawReport: string | null;
  error: string | null;
  // Provenance
  stkVersion: string | null;
  stkScenarioId: string | null;
  stkAnalysisId: string | null;
  stkThreshold: number | null;
  stkAnalysisStart: string | null;
  stkAnalysisEnd: string | null;
  stkResultTimestamp: string | null;
  stkRawReportHash: string | null;
}
