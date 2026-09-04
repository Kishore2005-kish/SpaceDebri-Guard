// Risk + Confidence engines.
//
// Conjunction Risk Score: 0-100 (heuristic, NOT probability of collision).
// Data Confidence: 0-100 (separate; reflects trust in the inputs).
//
// Weights are configurable; defaults follow the hackathon spec:
//   Miss distance       40%
//   Data uncertainty    20%
//   Relative velocity   15%
//   Encounter geometry  15%
//   Data freshness      10%

import { ConjunctionResult } from '../orbital/conjunction';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface RiskWeights {
  missDistance: number;     // 0..1
  dataUncertainty: number;
  relativeVelocity: number;
  encounterGeometry: number;
  dataFreshness: number;
}

export const DEFAULT_RISK_WEIGHTS: RiskWeights = {
  missDistance: 0.40,
  dataUncertainty: 0.20,
  relativeVelocity: 0.15,
  encounterGeometry: 0.15,
  dataFreshness: 0.10,
};

export interface RiskFactor {
  key: keyof RiskWeights;
  label: string;
  // Score 0..1 (higher = worse) for this individual factor.
  score: number;
  contribution: number; // weighted score (0..100)
  display: string;       // human-readable explanation
}

export interface RiskResult {
  score: number;          // 0..100
  level: RiskLevel;
  factors: RiskFactor[];
  weights: RiskWeights;
  covarianceAvailable: boolean;
  explanation: string;
  disclaimer: string;
}

export interface ConfidenceInputs {
  dataAgeHours: number;
  source: string;          // 'CELESTRAK' | 'OPERATOR' | 'DEMO'
  format: 'OMM' | 'TLE';
  covarianceAvailable: boolean;
  propagationHorizonHours: number;
  missingMetadata: boolean;
}

export interface ConfidenceResult {
  score: number;           // 0..100
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  contributors: string[];
}

// ----- Risk engine ------------------------------------------------------------

function missDistanceScore(minRangeKm: number): number {
  // Sub-500 m = 1.0 (worst), 5 km = 0.0 (best)
  // Linear in log space so 500m -> 1.0, 1 km -> ~0.87, 5km -> 0.0
  if (minRangeKm <= 0.5) return 1.0;
  if (minRangeKm >= 5) return 0.0;
  // log curve from (0.5, 1.0) to (5, 0)
  const t = (Math.log10(minRangeKm) - Math.log10(0.5)) / (Math.log10(5) - Math.log10(0.5));
  return 1 - Math.max(0, Math.min(1, t));
}

function relativeVelocityScore(v: number): number {
  // 0 km/s = 0, 15 km/s = 1
  if (v <= 0.5) return 0;
  if (v >= 15) return 1;
  return Math.min(1, v / 15);
}

function encounterGeometryScore(relPosRic: { radial: number; alongTrack: number; crossTrack: number }, minRangeKm: number): number {
  // Worst-case geometry is head-on along-track / radial encounters because
  // position uncertainty is largest along-track; but for this heuristic we
  // use the cosine of the relative velocity direction relative to line-of-sight.
  // If the rel-velocity is along the line of sight (head-on), the conjunction
  // "geometry" is dangerous.
  const r = Math.sqrt(relPosRic.radial * relPosRic.radial + relPosRic.alongTrack * relPosRic.alongTrack + relPosRic.crossTrack * relPosRic.crossTrack);
  if (r < 1e-6) return 1;
  // We don't have the rel velocity direction in RIC here, but we can use the
  // fact that along-track-biased encounters are most dangerous.
  const alongTrackShare = Math.abs(relPosRic.alongTrack) / r;
  const radialShare = Math.abs(relPosRic.radial) / r;
  // Head-on geometry (along-track + radial dominant) -> high score
  return Math.min(1, 0.5 * alongTrackShare + 0.5 * radialShare);
}

function dataUncertaintyScore(covarianceAvailable: boolean, secondaryType: string): number {
  if (covarianceAvailable) return 0.4; // still some uncertainty
  // No covariance -> worst case is debris (least tracked)
  if (secondaryType === 'DEBRIS') return 0.9;
  if (secondaryType === 'UNKNOWN') return 0.95;
  if (secondaryType === 'ROCKET_BODY') return 0.8;
  return 0.6;
}

function dataFreshnessScore(ageHours: number): number {
  // 0h = 0, 72h = 1
  if (ageHours <= 0) return 0;
  if (ageHours >= 72) return 1;
  return ageHours / 72;
}

export function computeRisk(
  conj: ConjunctionResult,
  primaryEpoch: Date,
  covarianceAvailable: boolean,
  secondaryObjectType: string,
  weights: RiskWeights = DEFAULT_RISK_WEIGHTS,
): RiskResult {
  const ageHours = Math.max(0, (Date.now() - primaryEpoch.getTime()) / 3600000);

  const md = missDistanceScore(conj.minRange);
  const rv = relativeVelocityScore(conj.relVelocity);
  const eg = encounterGeometryScore(conj.relPosRic, conj.minRange);
  const du = dataUncertaintyScore(covarianceAvailable, secondaryObjectType);
  const fr = dataFreshnessScore(ageHours);

  const factors: RiskFactor[] = [
    {
      key: 'missDistance',
      label: 'Distance',
      score: md,
      contribution: md * weights.missDistance * 100,
      display: `${conj.minRange < 1 ? (conj.minRange * 1000).toFixed(0) + ' m' : conj.minRange.toFixed(2) + ' km'}`,
    },
    {
      key: 'relativeVelocity',
      label: 'Velocity',
      score: rv,
      contribution: rv * weights.relativeVelocity * 100,
      display: `${conj.relVelocity.toFixed(2)} km/s`,
    },
    {
      key: 'encounterGeometry',
      label: 'Geometry',
      score: eg,
      contribution: eg * weights.encounterGeometry * 100,
      display: `Along: ${(conj.relPosRic.alongTrack).toFixed(1)} km, Radial: ${conj.relPosRic.radial.toFixed(1)} km`,
    },
    {
      key: 'dataUncertainty',
      label: 'Uncertainty',
      score: du,
      contribution: du * weights.dataUncertainty * 100,
      display: covarianceAvailable ? 'Covariance available' : 'Covariance unavailable',
    },
    {
      key: 'dataFreshness',
      label: 'Freshness',
      score: fr,
      contribution: fr * weights.dataFreshness * 100,
      display: `${ageHours.toFixed(1)} hours old`,
    },
  ];

  const total = factors.reduce((s, f) => s + f.contribution, 0);
  const score = Math.round(Math.max(0, Math.min(100, total)));
  const level = scoreToLevel(score);

  const explanation = [
    `Miss distance: ${conj.minRange < 1 ? (conj.minRange * 1000).toFixed(0) + ' m' : conj.minRange.toFixed(2) + ' km'}.`,
    `Relative velocity: ${conj.relVelocity.toFixed(2)} km/s.`,
    `Data age: ${ageHours.toFixed(1)} hours.`,
    `Secondary: ${secondaryObjectType.toLowerCase()}.`,
    `Covariance: ${covarianceAvailable ? 'available' : 'unavailable'}.`,
  ].join(' ');

  return {
    score,
    level,
    factors,
    weights,
    covarianceAvailable,
    explanation,
    disclaimer:
      'Prototype heuristic risk score, not official collision probability. ' +
      'Professional collision probability cannot be reliably calculated from the available data ' +
      (covarianceAvailable ? '' : 'because covariance is unavailable.'),
  };
}

export function scoreToLevel(score: number): RiskLevel {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MODERATE';
  return 'LOW';
}

// ----- Confidence engine ------------------------------------------------------

export function computeConfidence(inp: ConfidenceInputs): ConfidenceResult {
  const contributors: string[] = [];
  let score = 100;

  // Data age
  if (inp.dataAgeHours > 48) { score -= 25; contributors.push('Orbit data > 48h old'); }
  else if (inp.dataAgeHours > 24) { score -= 15; contributors.push('Orbit data > 24h old'); }
  else if (inp.dataAgeHours > 12) { score -= 8; contributors.push(`Orbit data ${inp.dataAgeHours.toFixed(1)}h old`); }
  else if (inp.dataAgeHours > 6) { score -= 4; contributors.push(`Orbit data ${inp.dataAgeHours.toFixed(1)}h old`); }

  // Source
  if (inp.source === 'CELESTRAK') {
    contributors.push('Public GP/OMM data (not authoritative)');
    score -= 5;
  } else if (inp.source === 'DEMO') {
    contributors.push('Demo dataset (offline)');
    score -= 30;
  }

  // Format
  if (inp.format === 'TLE') {
    contributors.push('TLE format (legacy, less precise)');
    score -= 5;
  }

  // Covariance
  if (!inp.covarianceAvailable) {
    score -= 15;
    contributors.push('Covariance unavailable');
  }

  // Propagation horizon
  if (inp.propagationHorizonHours > 24 * 5) { score -= 12; contributors.push('Long propagation horizon'); }
  else if (inp.propagationHorizonHours > 24 * 2) { score -= 6; contributors.push('Multi-day propagation'); }

  // Missing metadata
  if (inp.missingMetadata) { score -= 8; contributors.push('Missing object metadata'); }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 75 ? 'HIGH' : score >= 50 ? 'MEDIUM' : 'LOW';

  return { score, level, contributors: contributors.length > 0 ? contributors : ['All inputs nominal'] };
}
