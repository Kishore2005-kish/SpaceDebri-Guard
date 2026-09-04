// High-level STK service.
//
// This module orchestrates the full STK scenario lifecycle:
//   1. checkAvailable — is STK listening on the Connect port?
//   2. createScenario — New / Scenario / SENTINEL_<id>
//   3. setAnalysisInterval — setTimePeriod
//   4. createSatellite (primary + secondaries) — New + SetState with TLE/OMM
//   5. createAdvancedCat — CAT * ... AdvCat
//   6. runAnalysis — Run the CAT
//   7. extractConjunctionResult — Report from the CAT object
//   8. extractTrajectories — Report from each satellite's ephemeris
//   9. closeScenario — Unload / Scenario / SENTINEL_<id>
//
// All Connect commands follow the official STK Connect command reference:
//   https://help.agi.com/stk/Subsystems/connect/Content/start.htm
//
// References:
//   - STK Advanced CAT: https://help.agi.com/stk/Content/cat/Cat03.htm
//   - Collision-threat tutorial: https://help.agi.com/stk/Content/training/AdvCatTool.htm
//   - STK Python API: https://help.agi.com/stkdevkit/Content/python/pythonIntro.htm

import { checkStkAvailable, sendConnectCommand } from './client';
import { isAckResponse, isErrorResponse, extractErrorMessage, parseCatReport, parseTrajectoryReport, hashRawReport } from './parser';
import { StkStatus, StkScenarioConfig, StkConjunctionResult, TrajectoryPoint } from './types';

/**
 * Get STK status (cached for 30s).
 */
export async function getStkStatus(): Promise<StkStatus> {
  return checkStkAvailable();
}

/**
 * Create a new STK scenario with a unique name.
 * Connect command: New / Scenario / <name>
 *
 * Per the STK Connect reference:
 *   "Creates a new scenario, satellite, facility, etc. The path is the
 *   full path to the object to create."
 */
export async function createScenario(scenarioName: string): Promise<{ scenarioId: string; rawResponse: string }> {
  const command = `New / */Scenario/${scenarioName}`;
  const response = await sendConnectCommand(command);
  if (isErrorResponse(response)) throw new Error(`createScenario failed: ${extractErrorMessage(response)}`);
  return { scenarioId: scenarioName, rawResponse: response };
}

/**
 * Set the scenario analysis interval.
 * Connect command: SetTimePeriod * "<start>" "<end>" for a scenario.
 */
export async function setAnalysisInterval(scenarioName: string, startIso: string, endIso: string): Promise<string> {
  // STK expects "DD Mon YYYY HH:MM:SS.SSS" format
  const startStk = isoToStkDate(startIso);
  const endStk = isoToStkDate(endIso);
  const command = `SetTimePeriod * "${startStk}" "${endStk}"`;
  const response = await sendConnectCommand(command);
  if (isErrorResponse(response)) throw new Error(`setAnalysisInterval failed: ${extractErrorMessage(response)}`);
  return response;
}

/**
 * Create a satellite in STK from OMM/TLE orbital elements.
 * Connect commands:
 *   New / Scenario / <scn> / Satellite / <name>
 *   SetState * Satellite/<name> J2000 "<epoch>" TLE "<line1>" "<line2>"
 *
 * Per the STK Connect reference:
 *   "SetState sets the propagator and orbital state for a satellite."
 *   "Use TLE as the propagator to read two-line element sets."
 */
export async function createSatelliteFromTle(
  scenarioName: string,
  satName: string,
  epochIso: string,
  tleLine1: string,
  tleLine2: string,
): Promise<string> {
  // Sanitize satellite name (STK doesn't allow special chars)
  const safeName = satName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
  const stkEpoch = isoToStkDate(epochIso);
  // Create the satellite object
  const newCmd = `New / */Scenario/${scenarioName}/Satellite/${safeName}`;
  let response = await sendConnectCommand(newCmd);
  if (isErrorResponse(response)) throw new Error(`createSatellite (New) failed: ${extractErrorMessage(response)}`);
  // Set its state from TLE
  const setStateCmd = `SetState * Satellite/${safeName} J2000 "${stkEpoch}" TLE "${tleLine1}" "${tleLine2}"`;
  response = await sendConnectCommand(setStateCmd);
  if (isErrorResponse(response)) throw new Error(`createSatellite (SetState) failed: ${extractErrorMessage(response)}`);
  return safeName;
}

/**
 * Create the Advanced CAT object for a scenario.
 * Connect command: CAT * /Scenario/<scn>/Satellite/<primary> AdvCat
 *
 * Per the STK Advanced CAT documentation:
 *   "Advanced CAT (Conjunction Analysis Tools) identifies close approaches
//    between a primary satellite and a set of secondary objects."
 */
export async function createAdvancedCat(
  scenarioName: string,
  primaryName: string,
  thresholdKm: number,
): Promise<string> {
  const safePrimary = primaryName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
  // Create the Advanced CAT object
  const createCmd = `CAT * /Scenario/${scenarioName}/Satellite/${safePrimary} AdvCat`;
  const response = await sendConnectCommand(createCmd);
  if (isErrorResponse(response)) throw new Error(`createAdvancedCat failed: ${extractErrorMessage(response)}`);
  // Set the threshold (in km)
  // STK uses the "Conjunction" command to set the threshold
  const thresholdCmd = `Conjunction * /Scenario/${scenarioName}/Satellite/${safePrimary} AdvCat Threshold ${thresholdKm}`;
  const thresholdResp = await sendConnectCommand(thresholdCmd);
  if (isErrorResponse(thresholdResp)) {
    // Some STK versions use a different command name; try alternative
    const altCmd = `AdvCat * /Scenario/${scenarioName}/Satellite/${safePrimary} Threshold ${thresholdKm}`;
    await sendConnectCommand(altCmd);
  }
  return response;
}

/**
 * Run the Advanced CAT analysis.
 * Connect command: AdvCatRun * /Scenario/<scn>/Satellite/<primary>/AdvCat
 *
 * Per the STK documentation, this performs the actual close-approach
 * analysis and stores the results.
 */
export async function runAdvancedCat(scenarioName: string, primaryName: string): Promise<string> {
  const safePrimary = primaryName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
  const cmd = `AdvCatRun * /Scenario/${scenarioName}/Satellite/${safePrimary}/AdvCat`;
  const response = await sendConnectCommand(cmd, 300000);  // up to 5 minutes
  if (isErrorResponse(response)) throw new Error(`runAdvancedCat failed: ${extractErrorMessage(response)}`);
  return response;
}

/**
 * Extract the conjunction result from the Advanced CAT report.
 * Connect command: Report * /Scenario/<scn>/Satellite/<primary>/AdvCat Type Conjunction
 */
export async function getConjunctionResults(
  scenarioName: string,
  primaryName: string,
): Promise<{ rawReport: string; parsed: any }> {
  const safePrimary = primaryName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
  const cmd = `Report * /Scenario/${scenarioName}/Satellite/${safePrimary}/AdvCat Type Conjunction`;
  const response = await sendConnectCommand(cmd, 60000);
  if (isErrorResponse(response)) throw new Error(`getConjunctionResults failed: ${extractErrorMessage(response)}`);
  return { rawReport: response, parsed: parseCatReport(response) };
}

/**
 * Get a satellite's trajectory (ephemeris) for visualization.
 * Connect command: Report * Satellite/<name> Type Ephemeris
 */
export async function getTrajectory(
  scenarioName: string,
  satName: string,
): Promise<TrajectoryPoint[]> {
  const safeName = satName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
  const cmd = `Report * /Scenario/${scenarioName}/Satellite/${safeName} Type Ephemeris`;
  const response = await sendConnectCommand(cmd, 60000);
  if (isErrorResponse(response)) throw new Error(`getTrajectory failed: ${extractErrorMessage(response)}`);
  return parseTrajectoryReport(response);
}

/**
 * Get the close-approach report for the primary's Advanced CAT.
 */
export async function getCloseApproachReport(scenarioName: string, primaryName: string): Promise<string> {
  const safePrimary = primaryName.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 32);
  const cmd = `Report * /Scenario/${scenarioName}/Satellite/${safePrimary}/AdvCat Type CloseApproach`;
  const response = await sendConnectCommand(cmd, 60000);
  if (isErrorResponse(response)) throw new Error(`getCloseApproachReport failed: ${extractErrorMessage(response)}`);
  return response;
}

/**
 * Close (unload) an STK scenario.
 * Connect command: Unload / Scenario / <name>
 */
export async function closeScenario(scenarioName: string): Promise<string> {
  const cmd = `Unload / */Scenario/${scenarioName}`;
  try {
    const response = await sendConnectCommand(cmd, 10000);
    return response;
  } catch {
    return '';  // ignore unload errors
  }
}

/**
 * Convert an ISO 8601 date to STK's date format: "DD Mon YYYY HH:MM:SS.SSS"
 * Example: "2026-08-19T10:32:14.000Z" → "19 Aug 2026 10:32:14.000"
 */
function isoToStkDate(iso: string): string {
  const d = new Date(iso);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = months[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const time = d.toISOString().slice(11, 23);  // HH:MM:SS.sss
  return `${day} ${month} ${year} ${time}`;
}
