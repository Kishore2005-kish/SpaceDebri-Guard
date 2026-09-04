// Debug: load satellites from DB and run screen on the showcase pair.
import { db } from '@/lib/db';
import { screen } from '@/lib/orbital/conjunction';
import { propagate, relativeMotion } from '@/lib/orbital/propagator';

async function main() {
  // Ensure seeded
  const { ensureDemoSeeded } = await import('@/lib/services');
  await ensureDemoSeeded();

  const primary = await db.satellite.findUnique({ where: { id: 'MYSAT-01' } });
  const secondary = await db.satellite.findUnique({ where: { id: 'DBR-2841' } });
  if (!primary || !secondary) {
    console.log('Not found');
    return;
  }
  console.log('Primary epoch from DB:', primary.epoch.toISOString());
  console.log('Secondary epoch from DB:', secondary.epoch.toISOString());

  const primEls = {
    meanMotion: primary.meanMotion,
    eccentricity: primary.eccentricity,
    inclination: primary.inclination,
    raan: primary.raan,
    argPerigee: primary.argPerigee,
    meanAnomaly: primary.meanAnomaly,
    bstar: primary.bstar,
    epoch: primary.epoch,
  };
  const secEls = {
    meanMotion: secondary.meanMotion,
    eccentricity: secondary.eccentricity,
    inclination: secondary.inclination,
    raan: secondary.raan,
    argPerigee: secondary.argPerigee,
    meanAnomaly: secondary.meanAnomaly,
    bstar: secondary.bstar,
    epoch: secondary.epoch,
  };

  const now = new Date();
  const start = now;
  const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  console.log('\nScreen start:', start.toISOString());
  console.log('Screen end:', end.toISOString());
  console.log('Secondary epoch - screen start:', (secondary.epoch.getTime() - start.getTime()) / 3600000, 'hours');

  // Compute range at the secondary's epoch (= constructed TCA)
  const atTcaP = propagate(primEls, secondary.epoch);
  const atTcaS = propagate(secEls, secondary.epoch);
  const relAtTca = relativeMotion(atTcaP, atTcaS);
  console.log('\nAt secondary epoch (= constructed TCA):');
  console.log('  Range:', relAtTca.range.toFixed(4), 'km');
  console.log('  Rel vel:', relAtTca.relVel.toFixed(3), 'km/s');

  // Run screening
  const result = screen(primEls, secEls, start, end, 5);
  if (result) {
    console.log('\nScreening result:');
    console.log('  TCA:', result.tca.toISOString());
    console.log('  Min range:', result.minRange.toFixed(4), 'km');
    console.log('  Rel vel:', result.relVelocity.toFixed(3), 'km/s');
    console.log('  Offset from secondary epoch:', (result.tca.getTime() - secondary.epoch.getTime()) / 1000, 'sec');

    // Manually verify: compute range at screen's reported TCA
    const atScreenTcaP = propagate(primEls, result.tca);
    const atScreenTcaS = propagate(secEls, result.tca);
    const relScreenTca = relativeMotion(atScreenTcaP, atScreenTcaS);
    console.log('\n  Manual check at screen TCA:');
    console.log('    Range:', relScreenTca.range.toFixed(4), 'km');
    console.log('    Rel vel:', relScreenTca.relVel.toFixed(3), 'km/s');

    // Sample 10 fine points around the screen TCA
    console.log('\n  Fine samples around screen TCA:');
    for (let offset = -5; offset <= 5; offset++) {
      const t = new Date(result.tca.getTime() + offset * 1000);
      const p = propagate(primEls, t);
      const s = propagate(secEls, t);
      const r = relativeMotion(p, s);
      console.log(`    t=${t.toISOString().slice(11,23)} range=${r.range.toFixed(4)} km`);
    }
  } else {
    console.log('\nNo conjunction detected.');
  }

  // Also do a fine sweep around the constructed TCA to see what the actual
  // minimum is in that vicinity.
  console.log('\nFine sweep around constructed TCA:');
  const fineStart = secondary.epoch.getTime() - 30 * 60 * 1000;
  const fineEnd = secondary.epoch.getTime() + 30 * 60 * 1000;
  let minR = Infinity, minT: Date | null = null;
  for (let ms = fineStart; ms <= fineEnd; ms += 1000) {
    const t = new Date(ms);
    const p = propagate(primEls, t);
    const s = propagate(secEls, t);
    const r = relativeMotion(p, s);
    if (r.range < minR) { minR = r.range; minT = t; }
  }
  console.log('  Min range:', minR.toFixed(4), 'km at', minT?.toISOString());

  await db.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
