// Parser for STK Connect command responses.
//
// STK Connect responses are ASCII text. The format depends on the command:
//   - Acknowledgment commands return "ACK\n"
//   - Report commands return multi-line tabular ASCII
//   - Some commands return error: "ERROR: <message>\n"
//
// This module normalizes those responses into structured objects.
//
// References:
//   - STK Connect commands: https://help.agi.com/stk/Subsystems/connect/Content/start.htm
//   - Advanced CAT report format: https://help.agi.com/stk/Content/cat/Cat03.htm

import { TrajectoryPoint } from './types';

/** Check if a Connect response is an error. */
export function isErrorResponse(response: string): boolean {
  return response.trim().toUpperCase().startsWith('ERROR');
}

/** Extract the error message from a Connect response. */
export function extractErrorMessage(response: string): string {
  const m = response.match(/ERROR:\s*(.+)/i);
  return m ? m[1].trim() : response.trim();
}

/** Check if a Connect response is an acknowledgment. */
export function isAckResponse(response: string): boolean {
  return response.trim().toUpperCase() === 'ACK' || response.trim().toUpperCase().startsWith('ACK');
}

/**
 * Parse a trajectory report from STK.
 * Expected format (one line per time step):
 *   "01 Jan 2026 00:00:00.000"  -5000.0  3000.0  100.0  -5.0  3.0  0.1
 *         time                   x        y       z       vx    vy   vz
 *
 * Returns TrajectoryPoint[] (TEME frame, km and km/s).
 */
export function parseTrajectoryReport(report: string): TrajectoryPoint[] {
  const lines = report.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && !l.toUpperCase().startsWith('ACK'));
  const points: TrajectoryPoint[] = [];
  for (const line of lines) {
    // Try to parse: time x y z vx vy vz
    // The time can be in STK's date format ("01 Jan 2026 00:00:00.000") or ISO
    const parts = line.split(/\s+/);
    if (parts.length < 7) continue;
    // First 1-2 tokens are the date/time
    let timeStr: string;
    let rest: string[];
    if (parts[0].match(/^\d{4}-\d{2}-\d{2}T/)) {
      // ISO format
      timeStr = parts[0];
      rest = parts.slice(1);
    } else {
      // STK format: "01 Jan 2026 00:00:00.000" (5 tokens)
      timeStr = parts.slice(0, 5).join(' ');
      rest = parts.slice(5);
    }
    if (rest.length < 6) continue;
    const x = parseFloat(rest[0]);
    const y = parseFloat(rest[1]);
    const z = parseFloat(rest[2]);
    const vx = parseFloat(rest[3]);
    const vy = parseFloat(rest[4]);
    const vz = parseFloat(rest[5]);
    if ([x, y, z, vx, vy, vz].some(v => !isFinite(v))) continue;
    // Parse STK date → ISO
    let iso: string;
    try {
      const d = new Date(timeStr);
      iso = isNaN(d.getTime()) ? timeStr : d.toISOString();
    } catch {
      iso = timeStr;
    }
    points.push({ t: iso, x, y, z, vx, vy, vz });
  }
  return points;
}

/**
 * Parse an Advanced CAT report.
 * The report contains close-approach events with:
 *   - Secondary object name
 *   - TCA (time of closest approach)
 *   - Minimum range (km)
 *   - Relative velocity (km/s)
 *
 * Returns the first (closest) close approach found.
 */
export interface ParsedCatResult {
  secondaryName: string;
  tca: string;
  minimumRangeKm: number;
  relativeVelocityKmPerSec: number;
  rawReport: string;
}

export function parseCatReport(report: string): ParsedCatResult | null {
  const lines = report.split('\n').map(l => l.trim()).filter(l => l && !l.toUpperCase().startsWith('ACK'));
  // Look for a line that contains TCA / minimum range info
  // STK's CAT report format varies by version — we do a flexible parse
  let best: ParsedCatResult | null = null;
  let bestRange = Infinity;
  for (const line of lines) {
    // Try to extract: secondary name, TCA, min range
    // Example line: "ISS (ZARYA)  2026-Jan-01 10:32:14.000  0.830  11.40"
    const m = line.match(/^(.+?)\s+(\d{4}-\w{3}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+([\d.]+)\s+([\d.]+)\s*$/);
    if (m) {
      const name = m[1].trim();
      const tca = m[2].trim();
      const range = parseFloat(m[3]);
      const relVel = parseFloat(m[4]);
      if (isFinite(range) && range < bestRange) {
        bestRange = range;
        best = {
          secondaryName: name,
          tca,
          minimumRangeKm: range,
          relativeVelocityKmPerSec: relVel,
          rawReport: report,
        };
      }
    }
  }
  return best;
}

/**
 * Compute a SHA-like hash of the raw STK report for provenance.
 * (FNV-1a, not cryptographic, but stable for change detection.)
 */
export function hashRawReport(report: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < report.length; i++) {
    h ^= report.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').repeat(2).slice(0, 16);
}
