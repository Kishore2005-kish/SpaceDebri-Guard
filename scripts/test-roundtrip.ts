// Verify the SGP4 round-trip: construct a state, convert to elements,
// propagate back to the same time, check if the state matches.
import { propagateSgp4, buildSatrec } from '@/lib/orbital/sgp4';
import { cartesianToClassical, semiMajorAxisToMeanMotion } from '@/lib/orbital/elements';
import { OrbitalObject } from '@/lib/data/celestrak/types';

const TWO_PI = Math.PI * 2;

function makeObj(els: any): OrbitalObject {
  const aKm = Math.cbrt(398600.4418 / Math.pow(els.meanMotion * 2 * Math.PI / 86400, 2));
  return {
    catalogId: 'TEST',
    name: 'TEST',
    internationalDesignator: undefined,
    objectType: 'PAYLOAD',
    operationalStatus: undefined,
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
    source: 'TEST',
    retrievedAt: new Date().toISOString(),
    format: 'OMM',
    rawDataHash: '',
  };
}

console.log('=== SGP4 round-trip test ===\n');

// Pick a primary
const epoch = new Date(Date.now() - 9 * 3600 * 1000);
const primaryEls = {
  meanMotion: 15.0876,
  eccentricity: 0.0012,
  inclination: 97.6,
  raan: 210.0,
  argPerigee: 60.0,
  meanAnomaly: 0,
  bstar: 0,
  epoch,
};
const primaryObj = makeObj(primaryEls);

// Propagate primary to TCA (72h from now)
const tca = new Date(Date.now() + 72 * 3600 * 1000);
console.log('Primary epoch:', epoch.toISOString());
console.log('TCA:', tca.toISOString());
const primaryAtTca = propagateSgp4(primaryObj, tca);
console.log('Primary at TCA:');
console.log('  pos:', primaryAtTca.x.toFixed(2), primaryAtTca.y.toFixed(2), primaryAtTca.z.toFixed(2));
console.log('  vel:', primaryAtTca.vx.toFixed(4), primaryAtTca.vy.toFixed(4), primaryAtTca.vz.toFixed(4));

// Construct a secondary state at TCA (offset 0.15 km cross-track)
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

const secX = primaryAtTca.x + 0.15 * Cx;
const secY = primaryAtTca.y + 0.15 * Cy;
const secZ = primaryAtTca.z + 0.15 * Cz;

// Rotate primary velocity by 80° around R
const vDotR = primaryAtTca.vx * Rx + primaryAtTca.vy * Ry + primaryAtTca.vz * Rz;
const vDotS = primaryAtTca.vx * Sx + primaryAtTca.vy * Sy + primaryAtTca.vz * Sz;
const vDotC = primaryAtTca.vx * Cx + primaryAtTca.vy * Cy + primaryAtTca.vz * Cz;
const cosA = Math.cos(80 * Math.PI / 180);
const sinA = Math.sin(80 * Math.PI / 180);
const newVdotS = vDotS * cosA - vDotC * sinA;
const newVdotC = vDotS * sinA + vDotC * cosA;
const newVx = vDotR * Rx + newVdotS * Sx + newVdotC * Cx;
const newVy = vDotR * Ry + newVdotS * Sy + newVdotC * Cy;
const newVz = vDotR * Rz + newVdotS * Sz + newVdotC * Cz;

console.log('\nConstructed secondary state at TCA:');
console.log('  pos:', secX.toFixed(2), secY.toFixed(2), secZ.toFixed(2));
console.log('  vel:', newVx.toFixed(4), newVy.toFixed(4), newVz.toFixed(4));

// Convert to classical elements
const cls = cartesianToClassical({ x: secX, y: secY, z: secZ, vx: newVx, vy: newVy, vz: newVz });
console.log('\nConverted to classical:');
console.log('  a:', cls.a.toFixed(4), 'km');
console.log('  e:', cls.e);
console.log('  i:', (cls.i * 180 / Math.PI).toFixed(4), '°');
console.log('  raan:', (cls.raan * 180 / Math.PI).toFixed(4), '°');
console.log('  omega:', (cls.omega * 180 / Math.PI).toFixed(4), '°');
console.log('  nu:', (cls.nu * 180 / Math.PI).toFixed(4), '°');

// Convert true anomaly to mean anomaly
const E = 2 * Math.atan2(
  Math.sqrt(1 - cls.e) * Math.sin(cls.nu / 2),
  Math.sqrt(1 + cls.e) * Math.cos(cls.nu / 2),
);
const M = E - cls.e * Math.sin(E);
console.log('  E:', (E * 180 / Math.PI).toFixed(4), '°');
console.log('  M:', (M * 180 / Math.PI).toFixed(4), '°');

// Build the secondary OrbitalObject
const secEls = {
  meanMotion: semiMajorAxisToMeanMotion(cls.a),
  eccentricity: cls.e,
  inclination: (cls.i * 180 / Math.PI + 360) % 360,
  raan: (cls.raan * 180 / Math.PI + 360) % 360,
  argPerigee: (cls.omega * 180 / Math.PI + 360) % 360,
  meanAnomaly: (M * 180 / Math.PI + 360) % 360,
  bstar: 0,
  epoch: tca,
};
console.log('\nSecondary OrbitalElements:');
console.log('  MM:', secEls.meanMotion);
console.log('  e:', secEls.eccentricity);
console.log('  inc:', secEls.inclination, '°');
console.log('  raan:', secEls.raan, '°');
console.log('  omega:', secEls.argPerigee, '°');
console.log('  M:', secEls.meanAnomaly, '°');
console.log('  epoch:', secEls.epoch.toISOString());

// Now propagate the secondary to TCA (should return constructed state)
const secObj = makeObj(secEls);
const secAtTca = propagateSgp4(secObj, tca);
console.log('\nSecondary propagated to TCA (should match constructed):');
console.log('  pos:', secAtTca.x.toFixed(2), secAtTca.y.toFixed(2), secAtTca.z.toFixed(2));
console.log('  vel:', secAtTca.vx.toFixed(4), secAtTca.vy.toFixed(4), secAtTca.vz.toFixed(4));

const dx = secAtTca.x - secX;
const dy = secAtTca.y - secY;
const dz = secAtTca.z - secZ;
const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
console.log('\n  Position difference (constructed vs propagated):');
console.log('  Δ:', dist.toFixed(4), 'km');
console.log('  Δ:', (dist * 1000).toFixed(2), 'm');
