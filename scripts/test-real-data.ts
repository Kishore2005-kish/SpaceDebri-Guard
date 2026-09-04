// End-to-end real-data test: fetch ISS + stations from CelesTrak, screen
// pairwise for conjunctions, compute risk + confidence.
import { fetchRealCatalog } from '@/lib/data/celestrak';
import { screen } from '@/lib/orbital/conjunction';
import { propagateSgp4 } from '@/lib/orbital/sgp4';
import { relativeMotion } from '@/lib/orbital/propagator';
import { computeRisk, computeConfidence, DEFAULT_RISK_WEIGHTS } from '@/lib/risk/engine';

async function main() {
  console.log('=== SENTINEL end-to-end real-data test ===\n');
  const t0 = Date.now();

  console.log('1. Fetching real CelesTrak stations data...');
  const result = await fetchRealCatalog('stations');
  console.log(`   Source: ${result.source}`);
  console.log(`   Retrieved: ${result.retrievedAt}`);
  console.log(`   Objects fetched: ${result.recordsParsed}`);
  console.log(`   Parse errors: ${result.parseErrors.length}`);
  console.log(`   Duration: ${result.durationMs}ms`);

  if (result.objects.length === 0) {
    console.log('   No objects fetched — aborting.');
    return;
  }

  console.log('\n2. Fetched objects (sample):');
  result.objects.slice(0, 5).forEach(o => {
    console.log(`   - ${o.name} (NORAD ${o.catalogId}, ${o.objectType})`);
    console.log(`     Epoch: ${o.epoch}`);
    console.log(`     Inc: ${o.inclination.toFixed(4)}°, e: ${o.eccentricity.toFixed(7)}, MM: ${o.meanMotion.toFixed(6)} rev/day`);
    console.log(`     a: ${o.semiMajorAxisKm?.toFixed(2)} km, perigee: ${o.perigeeKm?.toFixed(2)} km, apogee: ${o.apogeeKm?.toFixed(2)} km, period: ${o.orbitalPeriodMin?.toFixed(2)} min`);
  });

  console.log('\n3. Propagating ISS to now + 3 days (sample every 30 min):');
  const iss = result.objects.find(o => o.catalogId === '25544') || result.objects[0];
  const now = new Date();
  const future = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const states: any[] = [];
  for (let ms = now.getTime(); ms <= future.getTime(); ms += 30 * 60 * 1000) {
    const s = propagateSgp4(iss, new Date(ms));
    states.push(s);
  }
  console.log(`   Propagated ${states.length} samples`);
  console.log(`   |r| at start: ${Math.sqrt(states[0].x ** 2 + states[0].y ** 2 + states[0].z ** 2).toFixed(2)} km`);
  console.log(`   |v| at start: ${Math.sqrt(states[0].vx ** 2 + states[0].vy ** 2 + states[0].vz ** 2).toFixed(4)} km/s`);
  console.log(`   |r| at end:   ${Math.sqrt(states[states.length - 1].x ** 2 + states[states.length - 1].y ** 2 + states[states.length - 1].z ** 2).toFixed(2)} km`);

  console.log('\n4. Pairwise conjunction screening (all station pairs):');
  let conjunctionCount = 0;
  let minRangeOverall = Infinity;
  let closestPair: any = null;
  for (let i = 0; i < result.objects.length; i++) {
    for (let j = i + 1; j < result.objects.length; j++) {
      const p = result.objects[i];
      const s = result.objects[j];
      try {
        const conj = screen(p, s, now, future, 50);  // large threshold to catch any close approaches
        if (conj) {
          conjunctionCount++;
          if (conj.minRange < minRangeOverall) {
            minRangeOverall = conj.minRange;
            closestPair = { p, s, conj };
          }
        }
      } catch (e: any) {
        // skip propagation failures
      }
    }
  }
  console.log(`   Conjunctions found (threshold 50 km, horizon 3 days): ${conjunctionCount}`);
  if (closestPair) {
    console.log(`   Closest: ${closestPair.p.name} ↔ ${closestPair.s.name}`);
    console.log(`     Min range: ${closestPair.conj.minRange.toFixed(3)} km`);
    console.log(`     TCA: ${closestPair.conj.tca.toISOString()}`);
    console.log(`     Rel vel: ${closestPair.conj.relVelocity.toFixed(3)} km/s`);

    // Compute risk for the closest
    const risk = computeRisk(closestPair.conj, new Date(closestPair.p.epoch), false, closestPair.s.objectType, DEFAULT_RISK_WEIGHTS);
    const conf = computeConfidence({
      dataAgeHours: (Date.now() - new Date(closestPair.p.epoch).getTime()) / 3600000,
      source: closestPair.p.source,
      format: closestPair.p.format,
      covarianceAvailable: false,
      propagationHorizonHours: (closestPair.conj.tca.getTime() - now.getTime()) / 3600000,
      missingMetadata: false,
    });
    console.log(`     Risk: ${risk.score}/100 (${risk.level})`);
    console.log(`     Confidence: ${conf.score}/100 (${conf.level})`);
    console.log(`     Disclaimer: ${risk.disclaimer.slice(0, 100)}...`);
  } else {
    console.log('   No conjunctions found in 3-day window (expected — stations are spread out).');
  }

  console.log(`\n=== Test complete in ${Date.now() - t0}ms ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
