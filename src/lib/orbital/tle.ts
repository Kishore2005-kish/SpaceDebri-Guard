// OMM-to-TLE converter (legacy compatibility path).
//
// Although the modern SGP4 wrapper (sgp4.ts) calls sgp4init() directly with
// orbital elements (bypassing the TLE parser), we keep this TLE generator
// for:
//   - CDM export (CCSDS CDM doesn't need TLE, but the GP table view does)
//   - Display in the UI ("show TLE for this object")
//   - Testing against the python sgp4 / satellite.js libraries
//
// WARNING: The legacy 2-line TLE format can only represent 5-digit catalog
// IDs. CelesTrak's current catalog includes 6+ digit IDs (per
// https://celestrak.org/NORAD/documentation/gp-data-formats.php). For these
// objects, the TLE representation will be lossy — prefer the OMM/JSON view
// for production work.

import { OrbitalObject } from '@/lib/data/celestrak/types';

/** Pad a number to a fixed width, right-justified. */
function pad(value: string | number, width: number): string {
  return String(value).padStart(width, ' ');
}

/** Format a float in scientific notation as TLE expects (e.g., +0.00001234 or -1.234e-4). */
function formatBstar(bstar: number): string {
  // TLE B* format: " sign N.NNNNNNNE±NN " (10 chars total after space)
  if (bstar === 0 || !isFinite(bstar)) {
    return ' 00000-0';
  }
  const sign = bstar < 0 ? '-' : '+';
  const mantissa = Math.abs(bstar).toExponential(5);  // "1.23456E-4"
  const m = mantissa.match(/^(\d)\.(\d{5})E([+-]?\d+)$/);
  if (!m) return ' 00000-0';
  const d1 = m[1];
  const d5 = m[2];
  let exp = parseInt(m[3], 10);
  // TLE expects mantissa in form 0.NNNNNN where the leading digit is implicit
  // Actually TLE format is " NNNNN-3 " meaning 0.NNNNN × 10^-3
  // So we need to shift: if mantissa is 1.23456E-4, that's 0.123456 × 10^-3
  // which is "12345-3" (5 digits of mantissa after the implicit 0.)
  // For simplicity, use the format " NNNNN-E " where NNNNN is the first 5 digits
  // of the normalized mantissa (without leading 1).
  let mantStr = (Math.abs(bstar) / Math.pow(10, exp)).toFixed(5);
  // mantStr now is like "0.12346" or "1.23460"
  const mantPart = mantStr.replace('0.', '').replace('.', '').slice(0, 5).padEnd(5, '0');
  return `${sign}${mantPart}${exp >= 0 ? '+' : '-'}${String(Math.abs(exp)).padStart(2, '0')}`;
}

/** Format mean-motion derivative (1st or 2nd) in TLE format. */
function formatMeanMotionDeriv(value: number): string {
  if (value === 0 || !isFinite(value)) {
    return ' .000000000  00000-0  00000-0';
  }
  const sign = value < 0 ? '-' : ' ';
  const abs = Math.abs(value);
  const exp = Math.floor(Math.log10(abs));
  const mantissa = abs / Math.pow(10, exp);
  // Format: " N.NNNNNNNN E±NN "  (20 chars)
  const m = mantissa.toFixed(8);
  return `${sign}${m}E${exp >= 0 ? '+' : '-'}${String(Math.abs(exp)).padStart(2, '0')}`;
}

/**
 * Convert an OMM/OrbitalObject to a 2-line TLE string pair.
 * For objects with 6+ digit catalog IDs, this will be lossy (only the last
 * 5 digits will fit) — a warning is included.
 */
export function ommToTle(obj: OrbitalObject): { line1: string; line2: string; warning?: string } {
  const catId = obj.catalogId;
  // For TLE, catalog ID must fit in 5 chars
  const tleCatId = catId.length <= 5 ? catId : catId.slice(-5);
  const warning = catId.length > 5 ? `Catalog ID ${catId} truncated to 5 digits in TLE (legacy format limitation)` : undefined;

  const epoch = new Date(obj.epoch);
  const year = epoch.getUTCFullYear();
  const dayOfYear = dayOfYearFraction(epoch);

  const intlDes = (obj.internationalDesignator || '').padEnd(8).slice(0, 8);

  // Line 1
  const classification = 'U';
  const line1 = (
    '1 ' +
    pad(tleCatId, 5) +
    classification +
    ' ' +
    intlDes +
    ' ' +
    pad(String(year % 100).padStart(2, '0'), 2) +
    pad(dayOfYear.toFixed(8), 12) +
    ' ' +
    formatMeanMotionDeriv(0) +
    ' ' +
    formatBstar(obj.bstar) +
    ' 0  999'
  ).trim();

  // Line 2
  const line2 = (
    '2 ' +
    pad(tleCatId, 5) +
    ' ' +
    pad(obj.inclination.toFixed(4), 8) +
    ' ' +
    pad(obj.raOfAscendingNode.toFixed(4), 8) +
    ' ' +
    pad((obj.eccentricity).toFixed(7).slice(2), 7) +  // eccentricity without leading "0."
    ' ' +
    pad(obj.argumentOfPerigee.toFixed(4), 8) +
    ' ' +
    pad(obj.meanAnomaly.toFixed(4), 8) +
    ' ' +
    pad(obj.meanMotion.toFixed(8), 11) +
    pad(String(obj.revAtEpoch ?? 0), 5)
  ).trim();

  return { line1, line2, warning };
}

/** Day-of-year + fractional day for a Date, e.g., "236.12345678". */
function dayOfYearFraction(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0);
  const diffMs = date.getTime() - start;
  return diffMs / 86400000 + 1;  // 1-indexed day of year
}
