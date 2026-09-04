// Maneuver what-if simulator.
//
// This module is NOT an autonomous maneuver planner. It is a "what-if" tool
// that lets an operator try different burn timings / directions / delta-V
// values and see how they affect the conjunction.
//
// For each scenario:
//   1) Take the maneuver time (hours before TCA).
//   2) Propagate the primary state forward to that time using SGP4.
//   3) Apply an impulsive delta-V in the requested direction (in the local
//      RIC frame at the burn time).
//   4) Convert the post-burn state back to orbital elements (a new
//      OrbitalObject with source = 'SENTINEL-SIMULATED').
//   5) Re-propagate both primary (post-burn) and secondary to TCA and
//      beyond using SGP4.
//   6) Re-screen the post-burn primary against the secondary AND against the
//      rest of the catalog to find new close approaches (the critical
//      "secondary conjunction check").
//   7) Compute new miss distance, new risk score, delta-V used, and the
//      orbital impact (semi-major axis change).
//
// All results are explicitly labeled "Simulation only — not a flight command."
// The maneuver does NOT modify the stored real catalog object — it produces
// a temporary simulated state used only for analysis.

import { OrbitalObject } from '@/lib/data/celestrak/types';
import { ConjunctionResult, screen, DEFAULT_SCREENING_THRESHOLD_KM } from '../orbital/conjunction';
import { propagateSgp4 } from '../orbital/sgp4';
import { applyImpulsiveManeuver } from '../orbital/maneuver-bridge';
import { relativeMotion } from '../orbital/propagator';
import { computeRisk, DEFAULT_RISK_WEIGHTS } from '../risk/engine';

export type ManeuverDirection = 'RADIAL' | 'ALONG_TRACK' | 'CROSS_TRACK';

export interface ManeuverScenarioInput {
  hoursBeforeTca: number;   // when to apply the burn
  deltaV: number;          // m/s
  direction: ManeuverDirection;
}

export interface ManeuverScenarioResult {
  label: string;
  hoursBeforeTca: number;
  deltaV: number;            // m/s (0 for baseline)
  direction: ManeuverDirection | null;
  missDistanceKm: number;
  relVelocityKmPerS: number;
  riskScore: number;
  riskLevel: string;
  newTca?: Date;
  semiMajorAxisChangeKm: number;
  newConjunctions: { secondaryId: string; secondaryName: string; minRangeKm: number; tca: Date }[];
  originalResolved: boolean;
  notes: string[];
}

export interface SimulatorOutput {
  baseline: ManeuverScenarioResult;
  scenarios: ManeuverScenarioResult[];
  bestScenario: ManeuverScenarioResult;
  recommendation: string;
  disclaimer: string;
  secondaryConjunctionCheckSummary: string;
}

const DEFAULT_TIMINGS: number[] = [72, 48, 36, 24, 12, 6];

function buildScenario(
  primaryElements: OrbitalObject,
  secondaryElements: OrbitalObject,
  secondaryCatalogObjects: { id: string; name: string; elements: OrbitalObject }[],
  baseline: ConjunctionResult,
  input: ManeuverScenarioInput | null,
  label: string,
  primaryObjectType: string = 'PAYLOAD',
  secondaryObjectType: string = 'DEBRIS',
): ManeuverScenarioResult {
  if (input === null) {
    // Baseline scenario: just the original conjunction
    const risk = computeRisk(
      baseline,
      new Date(primaryElements.epoch),
      false,  // covariance unavailable in this prototype
      secondaryObjectType,
      DEFAULT_RISK_WEIGHTS,
    );
    return {
      label,
      hoursBeforeTca: 0,
      deltaV: 0,
      direction: null,
      missDistanceKm: baseline.minRange,
      relVelocityKmPerS: baseline.relVelocity,
      riskScore: risk.score,
      riskLevel: risk.level,
      semiMajorAxisChangeKm: 0,
      newConjunctions: [],
      originalResolved: false,
      notes: ['Baseline (no maneuver applied)'],
    };
  }

  // Maneuver time = TCA - hoursBeforeTca
  const burnTime = new Date(baseline.tca.getTime() - input.hoursBeforeTca * 3600 * 1000);
  // Don't allow burns in the past
  const epochDate = new Date(primaryElements.epoch);
  if (burnTime.getTime() < epochDate.getTime()) {
    return {
      label,
      hoursBeforeTca: input.hoursBeforeTca,
      deltaV: input.deltaV,
      direction: input.direction,
      missDistanceKm: baseline.minRange,
      relVelocityKmPerS: baseline.relVelocity,
      riskScore: 100,
      riskLevel: 'CRITICAL',
      semiMajorAxisChangeKm: 0,
      newConjunctions: [],
      originalResolved: false,
      notes: ['Burn time before orbit epoch — invalid scenario'],
    };
  }

  // Apply delta-V (convert m/s to km/s)
  const dV = input.deltaV / 1000;
  const dVRadial = input.direction === 'RADIAL' ? dV : 0;
  const dVAlong = input.direction === 'ALONG_TRACK' ? dV : 0;
  const dVCross = input.direction === 'CROSS_TRACK' ? dV : 0;
  const newPrimary = applyImpulsiveManeuver(primaryElements, burnTime, dVRadial, dVAlong, dVCross);

  if (!newPrimary) {
    return {
      label,
      hoursBeforeTca: input.hoursBeforeTca,
      deltaV: input.deltaV,
      direction: input.direction,
      missDistanceKm: baseline.minRange,
      relVelocityKmPerS: baseline.relVelocity,
      riskScore: 100,
      riskLevel: 'CRITICAL',
      semiMajorAxisChangeKm: 0,
      newConjunctions: [],
      originalResolved: false,
      notes: ['Maneuver computation failed (propagation error)'],
    };
  }

  // Compute the new semi-major axis change
  const oldA = primaryElements.semiMajorAxisKm ?? 0;
  const newA = newPrimary.semiMajorAxisKm ?? 0;
  const deltaA = newA - oldA;

  // Re-screen new primary against the original secondary
  const screenStart = baseline.screeningStart;
  const screenEnd = baseline.screeningEnd;
  const newConj = screen(newPrimary, secondaryElements, screenStart, screenEnd, baseline.screeningThreshold);

  // Compute risk on the new conjunction (or 0 if cleared)
  let newRiskScore = 0;
  let newRiskLevel = 'LOW';
  let newMinRange = baseline.screeningThreshold * 2;
  let newRelVel = baseline.relVelocity;
  let newTca: Date | undefined = undefined;
  let originalResolved = true;
  if (newConj) {
    originalResolved = false;
    const risk = computeRisk(
      newConj,
      new Date(newPrimary.epoch),
      false,
      secondaryObjectType,
      DEFAULT_RISK_WEIGHTS,
    );
    newRiskScore = risk.score;
    newRiskLevel = risk.level;
    newMinRange = newConj.minRange;
    newRelVel = newConj.relVelocity;
    newTca = newConj.tca;
  } else {
    newMinRange = baseline.screeningThreshold * 2;
  }

  // Re-screen against the OTHER catalog objects (secondary conjunction check)
  const newConjunctions: ManeuverScenarioResult['newConjunctions'] = [];
  for (const obj of secondaryCatalogObjects) {
    if (obj.id === secondaryElements.catalogId) continue;
    const otherConj = screen(newPrimary, obj.elements, screenStart, screenEnd, baseline.screeningThreshold);
    if (otherConj) {
      newConjunctions.push({
        secondaryId: obj.id,
        secondaryName: obj.name,
        minRangeKm: otherConj.minRange,
        tca: otherConj.tca,
      });
    }
  }

  // Notes
  const notes: string[] = [];
  if (originalResolved) notes.push('Original conjunction cleared');
  else notes.push('Original conjunction persists with new miss distance');
  if (newConjunctions.length > 0) notes.push(`${newConjunctions.length} new conjunction(s) detected after maneuver`);

  return {
    label,
    hoursBeforeTca: input.hoursBeforeTca,
    deltaV: input.deltaV,
    direction: input.direction,
    missDistanceKm: newMinRange,
    relVelocityKmPerS: newRelVel,
    riskScore: newRiskScore,
    riskLevel: newRiskLevel,
    newTca,
    semiMajorAxisChangeKm: deltaA,
    newConjunctions,
    originalResolved,
    notes,
  };
}

export function simulateManeuvers(
  primaryElements: OrbitalObject,
  secondaryElements: OrbitalObject,
  secondaryCatalogObjects: { id: string; name: string; elements: OrbitalObject }[],
  baseline: ConjunctionResult,
  customScenarios?: ManeuverScenarioInput[],
  primaryObjectType: string = 'PAYLOAD',
  secondaryObjectType: string = 'DEBRIS',
): SimulatorOutput {
  const baseline_result = buildScenario(primaryElements, secondaryElements, secondaryCatalogObjects, baseline, null, 'Baseline',
    primaryObjectType, secondaryObjectType);

  const timings = customScenarios
    ? customScenarios.map(s => ({ hours: s.hoursBeforeTca, dV: s.deltaV, dir: s.direction }))
    : DEFAULT_TIMINGS.map(h => ({ hours: h, dV: 0.05 + (h / 1000), dir: 'ALONG_TRACK' as ManeuverDirection }));

  const scenarios: ManeuverScenarioResult[] = timings.map(t => {
    return buildScenario(
      primaryElements, secondaryElements, secondaryCatalogObjects, baseline,
      { hoursBeforeTca: t.hours, deltaV: t.dV, direction: t.dir },
      `${t.hours}h`,
      primaryObjectType, secondaryObjectType,
    );
  });

  // Best scenario = lowest risk AND no new unacceptable conjunctions
  const acceptableScenarios = scenarios.filter(s =>
    s.newConjunctions.every(c => c.minRangeKm > 1.0)
  );
  const candidates = acceptableScenarios.length > 0 ? acceptableScenarios : scenarios;
  const best = candidates.reduce((best, s) => {
    if (s.riskScore < best.riskScore) return s;
    if (s.riskScore === best.riskScore && s.hoursBeforeTca > best.hoursBeforeTca) return s;
    return best;
  }, candidates[0]);

  const recommendation = buildRecommendation(best, baseline, scenarios);

  const secondaryConjunctionCheckSummary =
    best.newConjunctions.length === 0
      ? 'No unacceptable secondary conjunctions detected after the best simulated option.'
      : `${best.newConjunctions.length} secondary conjunction(s) detected after the best simulated option. Review required.`;

  return {
    baseline: baseline_result,
    scenarios,
    bestScenario: best,
    recommendation,
    disclaimer: 'Simulation only. Not a flight command. Operational decisions require authoritative orbital data and qualified flight-dynamics analysis.',
    secondaryConjunctionCheckSummary,
  };
}

function buildRecommendation(
  best: ManeuverScenarioResult,
  baseline: ConjunctionResult,
  scenarios: ManeuverScenarioResult[],
): string {
  if (best.label === 'Baseline') {
    return 'No maneuver recommended at this time. Continue monitoring.';
  }
  const baselineRisk = computeRisk(baseline, new Date(0), false, 'DEBRIS', DEFAULT_RISK_WEIGHTS).score;
  const riskReduction = Math.max(0, baselineRisk - best.riskScore);
  return [
    `BEST SIMULATED OPTION`,
    ``,
    `Timing: ${best.hoursBeforeTca} hours before TCA`,
    `Direction: ${best.direction === 'ALONG_TRACK' ? 'Along-track' : best.direction === 'RADIAL' ? 'Radial' : 'Cross-track'}`,
    `ΔV: ${best.deltaV.toFixed(3)} m/s`,
    `Risk: ${scenarios[0].riskScore} → ${best.riskScore}`,
    `Risk reduction: ${riskReduction} points`,
    `Miss distance: ${(scenarios[0].missDistanceKm).toFixed(2)} km → ${best.missDistanceKm.toFixed(2)} km`,
    `Secondary conjunctions: ${best.newConjunctions.length === 0 ? 'None detected' : `${best.newConjunctions.length} detected`}`,
    ``,
    `Simulation only — not a flight command.`,
  ].join('\n');
}
