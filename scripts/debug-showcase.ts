// Debug: check that the showcase conjunction (MYSAT-01 vs DBR-2841) is detected.
import { db } from '@/lib/db';
import { ensureDemoSeeded, toOrbitalObjectHelper } from '@/lib/services';
import { screen } from '@/lib/orbital/conjunction';
import { propagateSgp4 } from '@/lib/orbital/sgp4';
import { relativeMotion } from '@/lib/orbital/propagator';

async function main() {
  await ensureDemoSeeded();
  const primary = await db.satellite.findUnique({ where: { id: 'MYSAT-01' } });
  const secondary = await db.satellite.findUnique({ where: { id: 'DBR-2841' } });
  if (!primary || !secondary) {
    console.log('Not found');
    return;
  }
  console.log('Primary:', primary.name, 'epoch:', primary.epoch.toISOString());
  console.log('  MM:', primary.meanMotion, 'inc:', primary.inclination, 'e:', primary.eccentricity);
  console.log('Secondary:', secondary.name, 'epoch:', secondary.epoch.toISOString());
  console.log('  MM:', secondary.meanMotion, 'inc:', secondary.inclination, 'e:', secondary.eccentricity);

  const primObj = {
    catalogId: primary.id,
    name: primary.name,
    internationalDesignator: primary.intlDes ?? undefined,
    objectType: primary.objectType as any,
    epoch: primary.epoch.toISOString(),
    meanMotion: primary.meanMotion,
    eccentricity: primary.eccentricity,
    inclination: primary.inclination,
    raOfAscendingNode: primary.raan,
    argumentOfPerigee: primary.argPerigee,
    meanAnomaly: primary.meanAnomaly,
    bstar: primary.bstar,
    source: primary.source,
    format: primary.format as any,
    retrievedAt: primary.retrievalTime.toISOString(),
    rawDataHash: primary.rawHash ?? '',
  };
  const secObj = {
    catalogId: secondary.id,
    name: secondary.name,
    internationalDesignator: secondary.intlDes ?? undefined,
    objectType: secondary.objectType as any,
    epoch: secondary.epoch.toISOString(),
    meanMotion: secondary.meanMotion,
    eccentricity: secondary.eccentricity,
    inclination: secondary.inclination,
    raOfAscendingNode: secondary.raan,
    argumentOfPerigee: secondary.argPerigee,
    meanAnomaly: secondary.meanAnomaly,
    bstar: secondary.bstar,
    source: secondary.source,
    format: secondary.format as any,
    retrievedAt: secondary.retrievalTime.toISOString(),
    rawDataHash: secondary.rawHash ?? '',
  };

  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  // Check range at the secondary's epoch (= constructed TCA)
  const tca = secondary.epoch;
  console.log('\nAt secondary epoch (= constructed TCA):', tca.toISOString());
  const pAtTca = propagateSgp4(primObj, tca);
  const sAtTca = propagateSgp4(secObj, tca);
  const rel = relativeMotion(pAtTca, sAtTca);
  console.log('  Range:', rel.range.toFixed(4), 'km');
  console.log('  Rel vel:', rel.relVel.toFixed(3), 'km/s');

  // Run screening
  console.log('\nRunning screen()...');
  const conj = screen(primObj, secObj, now, end, 5);
  if (conj) {
    console.log('Conjunction detected!');
    console.log('  TCA:', conj.tca.toISOString());
    console.log('  Min range:', conj.minRange.toFixed(4), 'km');
    console.log('  Rel vel:', conj.relVelocity.toFixed(3), 'km/s');
  } else {
    console.log('No conjunction detected.');
    // Sample manually to find min
    let minR = Infinity, minT: Date | null = null;
    for (let ms = now.getTime(); ms <= end.getTime(); ms += 60 * 1000) {
      const t = new Date(ms);
      try {
        const p = propagateSgp4(primObj, t);
        const s = propagateSgp4(secObj, t);
        const r = relativeMotion(p, s);
        if (r.range < minR) { minR = r.range; minT = t; }
      } catch {}
    }
    console.log('Coarse min range:', minR.toFixed(4), 'km at', minT?.toISOString());
  }

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
