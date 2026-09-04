// Demo dataset for the Space-Debris Collision Risk Visualizer.
// This dataset is bundled so the demo can run WITHOUT internet access.
//
// The orbital elements below are SYNTHETIC EXAMPLES used for demonstration only.
// They are NOT authoritative GP/TLE data. Real operational use requires
// fetching the latest OMM/TLE from CelesTrak and using the official
// SGP4 propagator (which we now use for both LIVE and DEMO paths).
//
// We construct the showcase conjunction DETERMINISTICALLY using SGP4:
//   1) Pick primary elements (sun-sync LEO)
//   2) SGP4-propagate primary forward to a target TCA time
//   3) Construct the secondary's Cartesian state at TCA so it is
//      positioned close to the primary with a different velocity vector
//      (creating a high-rel-vel crossing encounter)
//   4) Convert the secondary's Cartesian state back to classical orbital
//      elements with epoch=TCA, so SGP4 propagation returns the constructed
//      state at TCA exactly.
//
// All demo objects are clearly labeled:
//   - source = 'SENTINEL-DEMO'
//   - operationalStatus = 'SYNTHETIC-DEMO-OBJECT'
//   - UI badge: yellow '●DEMO'

import { OrbitalElements, MU_EARTH, semiMajorAxisToMeanMotion, cartesianToClassical } from '../orbital/elements';
import { propagateSgp4 } from '../orbital/sgp4';
import { OrbitalObject } from '../data/celestrak/types';

export interface DemoSatellite {
  id: string;
  name: string;
  intlDes: string;
  objectType: 'PAYLOAD' | 'DEBRIS' | 'ROCKET_BODY' | 'UNKNOWN';
  isProtected: boolean;
  elements: OrbitalElements;
  source: string;
  format: 'OMM' | 'TLE';
  rawHash: string;
}

const TWO_PI = Math.PI * 2;

function aToMeanMotion(aKm: number): number {
  const nRadSec = Math.sqrt(MU_EARTH / (aKm * aKm * aKm));
  return nRadSec * 86400 / TWO_PI;
}

function buildElements(
  opts: {
    a: number; e: number; inc: number; raan: number; omega: number;
    meanAnomaly?: number; bstar?: number;
  },
  epoch: Date,
): OrbitalElements {
  return {
    meanMotion: aToMeanMotion(opts.a),
    eccentricity: opts.e,
    inclination: opts.inc,
    raan: opts.raan,
    argPerigee: opts.omega,
    meanAnomaly: opts.meanAnomaly ?? 0,
    bstar: opts.bstar ?? 0,
    epoch,
  };
}

function fakeHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  const base = Math.abs(h).toString(16).padStart(8, '0');
  return (base + base + base + base + base + base + base + base).slice(0, 64);
}

// Convert OrbitalElements → OrbitalObject so we can use SGP4 propagator
function elementsToOrbitalObject(els: OrbitalElements, meta: { catalogId: string; name: string; objectType: OrbitalObject['objectType']; source: string; }): OrbitalObject {
  const aKm = Math.cbrt(MU_EARTH / Math.pow(els.meanMotion * 2 * Math.PI / 86400, 2));
  return {
    catalogId: meta.catalogId,
    name: meta.name,
    internationalDesignator: undefined,
    objectType: meta.objectType,
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
    perigeeKm: aKm * (1 - els.eccentricity) - 6378.137,
    apogeeKm: aKm * (1 + els.eccentricity) - 6378.137,
    orbitalPeriodMin: 1440 / els.meanMotion,
    source: meta.source,
    retrievedAt: new Date().toISOString(),
    format: 'OMM',
    rawDataHash: '',
  };
}

// Build a secondary satellite whose orbit crosses the primary's at TCA with
// a specified miss distance and a specified rotation of the velocity vector
// around the radial axis (creates a different orbital plane crossing the
// primary's at the same point, with high relative velocity).
//
// Construction uses SGP4 to propagate the primary to TCA, so the resulting
// secondary elements (when propagated with SGP4) will indeed meet at TCA.
//
// IMPORTANT: We iterate the construction 2-3 times to converge on the desired
// miss distance, because there's a ~5 km short-period variation between
// osculating elements (what cartesianToClassical returns) and mean elements
// (what SGP4 expects). Without iteration, the actual min range would be
// off by ~5 km.
function buildCrossingSecondary(
  primaryElements: OrbitalElements,
  primaryMeta: { catalogId: string; name: string; objectType: OrbitalObject['objectType'] },
  missDistanceKm: number,
  velRotDeg: number,
  tca: Date,
): OrbitalElements {
  // 1) Convert primary elements to OrbitalObject and propagate to TCA with SGP4
  const primaryObj = elementsToOrbitalObject(primaryElements, { ...primaryMeta, source: 'SENTINEL-DEMO' });
  const primaryAtTca = propagateSgp4(primaryObj, tca);

  // 2) Iterate the construction to converge on the desired miss distance
  // First iteration: construct with the desired offset
  let currentOffset = { x: 0, y: 0, z: 0 };  // offset to add to primary_pos to get sec_pos
  let secondaryEls: OrbitalElements | null = null;

  for (let iter = 0; iter < 4; iter++) {
    // Compute RIC frame at primary's TCA state
    const r = Math.sqrt(primaryAtTca.x ** 2 + primaryAtTca.y ** 2 + primaryAtTca.z ** 2);
    const Rx = primaryAtTca.x / r, Ry = primaryAtTca.y / r, Rz = primaryAtTca.z / r;
    const hx = primaryAtTca.y * primaryAtTca.vz - primaryAtTca.z * primaryAtTca.vy;
    const hy = primaryAtTca.z * primaryAtTca.vx - primaryAtTca.x * primaryAtTca.vz;
    const hz = primaryAtTca.x * primaryAtTca.vy - primaryAtTca.y * primaryAtTca.vx;
    const hMag = Math.sqrt(hx * hx + hy * hy + hz * hz);
    const Cx = hx / hMag, Cy = hy / hMag, Cz = hz / hMag;
    const Sx = Cy * Rz - Cz * Ry;
    const Sy = Cz * Rx - Cx * Rz;
    const Sz = Cx * Ry - Cy * Rx;

    // Apply position offset (currentOffset is in ECI; for the FIRST iteration,
    // we add missDistanceKm in the cross-track direction)
    let offsetX, offsetY, offsetZ;
    if (iter === 0) {
      offsetX = missDistanceKm * Cx;
      offsetY = missDistanceKm * Cy;
      offsetZ = missDistanceKm * Cz;
    } else {
      offsetX = currentOffset.x;
      offsetY = currentOffset.y;
      offsetZ = currentOffset.z;
    }

    const secX = primaryAtTca.x + offsetX;
    const secY = primaryAtTca.y + offsetY;
    const secZ = primaryAtTca.z + offsetZ;

    // Rotate primary velocity by velRotDeg around the radial axis
    const vDotR = primaryAtTca.vx * Rx + primaryAtTca.vy * Ry + primaryAtTca.vz * Rz;
    const vDotS = primaryAtTca.vx * Sx + primaryAtTca.vy * Sy + primaryAtTca.vz * Sz;
    const vDotC = primaryAtTca.vx * Cx + primaryAtTca.vy * Cy + primaryAtTca.vz * Cz;
    const cosA = Math.cos(velRotDeg * Math.PI / 180);
    const sinA = Math.sin(velRotDeg * Math.PI / 180);
    const newVdotS = vDotS * cosA - vDotC * sinA;
    const newVdotC = vDotS * sinA + vDotC * cosA;
    const newVx = vDotR * Rx + newVdotS * Sx + newVdotC * Cx;
    const newVy = vDotR * Ry + newVdotS * Sy + newVdotC * Cy;
    const newVz = vDotR * Rz + newVdotS * Sz + newVdotC * Cz;

    // Convert the constructed Cartesian state to classical elements
    const cls = cartesianToClassical({ x: secX, y: secY, z: secZ, vx: newVx, vy: newVy, vz: newVz });
    const E = 2 * Math.atan2(
      Math.sqrt(1 - cls.e) * Math.sin(cls.nu / 2),
      Math.sqrt(1 + cls.e) * Math.cos(cls.nu / 2),
    );
    const M = E - cls.e * Math.sin(E);
    const deg = (rad: number) => ((rad * 180 / Math.PI) % 360 + 360) % 360;
    secondaryEls = {
      meanMotion: semiMajorAxisToMeanMotion(cls.a),
      eccentricity: cls.e,
      inclination: deg(cls.i),
      raan: deg(cls.raan),
      argPerigee: deg(cls.omega),
      meanAnomaly: deg(M),
      bstar: 0,
      epoch: tca,
    };

    // Propagate the secondary back to TCA and measure the actual offset
    const secObj = elementsToOrbitalObject(secondaryEls, { ...primaryMeta, catalogId: 'ITER', name: 'ITER', source: 'SENTINEL-DEMO' });
    let secAtTca;
    try {
      secAtTca = propagateSgp4(secObj, tca);
    } catch {
      break;
    }
    const actualOffsetX = secAtTca.x - primaryAtTca.x;
    const actualOffsetY = secAtTca.y - primaryAtTca.y;
    const actualOffsetZ = secAtTca.z - primaryAtTca.z;
    const actualMag = Math.sqrt(actualOffsetX ** 2 + actualOffsetY ** 2 + actualOffsetZ ** 2);

    // Compute the desired offset direction (unit vector in cross-track)
    const desiredDir = { x: Cx, y: Cy, z: Cz };

    // Compute the error: actual offset minus desired offset
    const errorX = actualOffsetX - missDistanceKm * desiredDir.x;
    const errorY = actualOffsetY - missDistanceKm * desiredDir.y;
    const errorZ = actualOffsetZ - missDistanceKm * desiredDir.z;
    const errorMag = Math.sqrt(errorX ** 2 + errorY ** 2 + errorZ ** 2);

    if (iter < 3 && errorMag > 0.01) {
      // Adjust the construction offset to compensate for the error
      currentOffset = {
        x: missDistanceKm * desiredDir.x - errorX,
        y: missDistanceKm * desiredDir.y - errorY,
        z: missDistanceKm * desiredDir.z - errorZ,
      };
      continue;
    }
    break;
  }

  return secondaryEls!;
}

// Build the full demo dataset relative to "now".
export function buildDemoDataset(now: Date = new Date()): {
  satellites: DemoSatellite[];
  showcasePrimaryId: string;
  showcaseSecondaryId: string;
} {
  const epoch = new Date(now.getTime() - 9 * 3600 * 1000);

  // --- Primary protected satellites (small-sat operator fleet) ----------------
  const mySat01Elements: OrbitalElements = buildElements({
    a: 6918.137, e: 0.0012, inc: 97.6, raan: 210.0, omega: 60.0,
  }, epoch);

  const mySat02Elements: OrbitalElements = buildElements({
    a: 6978.137, e: 0.008, inc: 53.0, raan: 145.0, omega: 30.0,
  }, epoch);

  const mySat03Elements: OrbitalElements = buildElements({
    a: 6958.137, e: 0.0021, inc: 51.6, raan: 80.0, omega: 110.0,
  }, epoch);

  // --- Showcase conjunction (TCA = 72h from now) ----------------------------
  const targetTca = new Date(now.getTime() + 72 * 3600 * 1000);
  const debris01Elements = buildCrossingSecondary(
    mySat01Elements,
    { catalogId: 'MYSAT-01', name: 'MySat-01', objectType: 'PAYLOAD' },
    0.15,   // miss distance km
    80,     // velocity rotation degrees → ~9.8 km/s rel vel
    targetTca,
  );

  // Additional conjunctions for MySat-02 and MySat-03
  function buildConjunctionFor(
    primary: OrbitalElements,
    primaryMeta: { catalogId: string; name: string; objectType: OrbitalObject['objectType'] },
    hoursFromNow: number,
    offsetKm: number,
    velRotDeg: number,
  ): OrbitalElements {
    const tca = new Date(now.getTime() + hoursFromNow * 3600 * 1000);
    return buildCrossingSecondary(primary, primaryMeta, offsetKm, velRotDeg, tca);
  }

  const debris02Elements = buildConjunctionFor(
    mySat02Elements,
    { catalogId: 'MYSAT-02', name: 'MySat-02', objectType: 'PAYLOAD' },
    48, 0.4, 60,
  );

  const rb01Elements = buildConjunctionFor(
    mySat03Elements,
    { catalogId: 'MYSAT-03', name: 'MySat-03', objectType: 'PAYLOAD' },
    120, 0.3, 50,
  );

  // Other catalog objects (realistic-looking LEO objects, synthetic)
  const otherObjects: { id: string; name: string; intlDes: string; type: DemoSatellite['objectType']; els: OrbitalElements }[] = [
    { id: 'DBR-1124', name: 'Debris-1124', intlDes: '2006-049D', type: 'DEBRIS',
      els: buildElements({ a: 7000, e: 0.002, inc: 98.1, raan: 195.0, omega: 40.0, meanAnomaly: 30 }, epoch) },
    { id: 'RB-CZ4B', name: 'CZ-4B R/B', intlDes: '2019-074C', type: 'ROCKET_BODY',
      els: buildElements({ a: 7120, e: 0.005, inc: 97.4, raan: 220.0, omega: 70.0, meanAnomaly: 120 }, epoch) },
    { id: 'DBR-3209', name: 'Debris-3209', intlDes: '2012-0058J', type: 'DEBRIS',
      els: buildElements({ a: 6900, e: 0.001, inc: 53.0, raan: 145.0, omega: 30.0, meanAnomaly: 200 }, epoch) },
    { id: 'IRIDIUM-33-DBR', name: 'Iridium-33 Debris', intlDes: '1997-051F', type: 'DEBRIS',
      els: buildElements({ a: 7150, e: 0.0022, inc: 86.4, raan: 230.0, omega: 30.0, meanAnomaly: 80 }, epoch) },
    { id: 'COSMOS-2251-DBR', name: 'Cosmos-2251 Debris', intlDes: '1993-016B', type: 'DEBRIS',
      els: buildElements({ a: 7050, e: 0.003, inc: 74.0, raan: 280.0, omega: 100.0, meanAnomaly: 45 }, epoch) },
    { id: 'SENTINEL-2B', name: 'Sentinel-2B', intlDes: '2017-013A', type: 'PAYLOAD',
      els: buildElements({ a: 7168, e: 0.0001, inc: 98.56, raan: 200.0, omega: 90.0, meanAnomaly: 15 }, epoch) },
    { id: 'PLANET-0E1', name: 'Planet-Scope 0E1', intlDes: '2020-035H', type: 'PAYLOAD',
      els: buildElements({ a: 6918, e: 0.0005, inc: 97.9, raan: 215.0, omega: 50.0, meanAnomaly: 270 }, epoch) },
    { id: 'STARLINK-1520', name: 'Starlink-1520', intlDes: '2020-001AT', type: 'PAYLOAD',
      els: buildElements({ a: 6918, e: 0.0002, inc: 53.05, raan: 145.0, omega: 30.0, meanAnomaly: 90 }, epoch) },
    { id: 'STARLINK-3011', name: 'Starlink-3011', intlDes: '2022-001AB', type: 'PAYLOAD',
      els: buildElements({ a: 6910, e: 0.0002, inc: 53.0, raan: 145.5, omega: 30.0, meanAnomaly: 150 }, epoch) },
    { id: 'STARLINK-4582', name: 'Starlink-4582', intlDes: '2024-012XY', type: 'PAYLOAD',
      els: buildElements({ a: 6925, e: 0.0002, inc: 53.0, raan: 145.2, omega: 30.0, meanAnomaly: 240 }, epoch) },
    { id: 'FENGYUN-3C', name: 'FengYun-3C', intlDes: '2013-073A', type: 'PAYLOAD',
      els: buildElements({ a: 7128, e: 0.0015, inc: 98.6, raan: 200.0, omega: 90.0, meanAnomaly: 200 }, epoch) },
    { id: 'NOAA-20', name: 'NOAA-20', intlDes: '2017-073A', type: 'PAYLOAD',
      els: buildElements({ a: 7228, e: 0.0006, inc: 98.7, raan: 200.0, omega: 70.0, meanAnomaly: 180 }, epoch) },
    { id: 'METOP-B', name: 'Metop-B', intlDes: '2012-049A', type: 'PAYLOAD',
      els: buildElements({ a: 7195, e: 0.0017, inc: 98.7, raan: 200.0, omega: 50.0, meanAnomaly: 60 }, epoch) },
    { id: 'DBR-7711', name: 'Debris-7711', intlDes: '1998-001HX', type: 'DEBRIS',
      els: buildElements({ a: 7050, e: 0.015, inc: 65.0, raan: 110.0, omega: 30.0, meanAnomaly: 300 }, epoch) },
    { id: 'DBR-9032', name: 'Debris-9032', intlDes: '2014-0YZ', type: 'UNKNOWN',
      els: buildElements({ a: 6890, e: 0.001, inc: 51.6, raan: 80.0, omega: 110.0, meanAnomaly: 10 }, epoch) },
    { id: 'RB-DELTA-4', name: 'Delta-4 R/B', intlDes: '2010-040C', type: 'ROCKET_BODY',
      els: buildElements({ a: 7080, e: 0.018, inc: 28.5, raan: 60.0, omega: 30.0, meanAnomaly: 250 }, epoch) },
    { id: 'SL-16-DBR', name: 'SL-16 R/B', intlDes: '2007-040D', type: 'ROCKET_BODY',
      els: buildElements({ a: 7250, e: 0.003, inc: 71.0, raan: 240.0, omega: 90.0, meanAnomaly: 320 }, epoch) },
    { id: 'IRS-1C-DBR', name: 'IRS Debris', intlDes: '1995-017A', type: 'DEBRIS',
      els: buildElements({ a: 7400, e: 0.022, inc: 98.0, raan: 195.0, omega: 30.0, meanAnomaly: 100 }, epoch) },
  ];

  function mk(
    id: string, name: string, intlDes: string,
    type: DemoSatellite['objectType'], isProtected: boolean,
    elements: OrbitalElements,
  ): DemoSatellite {
    return {
      id, name, intlDes, objectType: type, isProtected,
      elements,
      source: 'SENTINEL-DEMO',
      format: 'OMM',
      rawHash: fakeHash(id + name + JSON.stringify(elements)),
    };
  }

  const sats: DemoSatellite[] = [
    mk('MYSAT-01', 'MySat-01', '2026-041A', 'PAYLOAD', true, mySat01Elements),
    mk('MYSAT-02', 'MySat-02', '2026-041B', 'PAYLOAD', true, mySat02Elements),
    mk('MYSAT-03', 'MySat-03', '2026-041C', 'PAYLOAD', true, mySat03Elements),
    mk('DBR-2841', 'Debris-2841', '2009-019BG', 'DEBRIS', false, debris01Elements),
    mk('DBR-5523', 'Debris-5523', '2014-019F', 'DEBRIS', false, debris02Elements),
    mk('RB-CZ2C', 'CZ-2C R/B', '2018-052D', 'ROCKET_BODY', false, rb01Elements),
    ...otherObjects.map(o => mk(o.id, o.name, o.intlDes, o.type, false, o.els)),
  ];

  return {
    satellites: sats,
    showcasePrimaryId: 'MYSAT-01',
    showcaseSecondaryId: 'DBR-2841',
  };
}

