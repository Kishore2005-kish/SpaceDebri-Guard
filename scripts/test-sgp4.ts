// Test the SGP4 propagator with real ISS data from CelesTrak.
import { fetchStations } from '@/lib/data/celestrak/client';
import { normalizeRecords } from '@/lib/data/celestrak/normalizer';
import { propagateSgp4, SGP4_VERSION } from '@/lib/orbital/sgp4';

async function main() {
  console.log('--- SGP4 propagator test ---');
  console.log('SGP4 version:', SGP4_VERSION);

  console.log('\n1. Fetching ISS + stations from CelesTrak...');
  const result = await fetchStations();
  console.log(`   Fetched ${result.records.length} records in ${result.durationMs}ms`);
  if (result.parseErrors.length > 0) {
    console.log('   Parse errors:', result.parseErrors.slice(0, 3));
  }
  if (result.records.length === 0) {
    console.log('   No records! Aborting.');
    return;
  }
  const objects = normalizeRecords(result.records);

  // Find ISS
  const iss = objects.find(o => o.name.includes('ISS') || o.catalogId === '25544') || objects[0];
  console.log(`\n2. Using object: ${iss.name} (NORAD ${iss.catalogId})`);
  console.log(`   Epoch: ${iss.epoch}`);
  console.log(`   Mean motion: ${iss.meanMotion} rev/day`);
  console.log(`   Inclination: ${iss.inclination}°`);
  console.log(`   Eccentricity: ${iss.eccentricity}`);
  console.log(`   B*: ${iss.bstar}`);
  console.log(`   Semi-major axis: ${iss.semiMajorAxisKm?.toFixed(2)} km`);

  console.log('\n3. Propagating ISS to "now" + 1 hour...');
  const now = new Date();
  const future = new Date(now.getTime() + 3600 * 1000);

  try {
    const stateNow = propagateSgp4(iss, now);
    const stateFuture = propagateSgp4(iss, future);

    console.log('   At now:');
    console.log('     pos:', stateNow.x.toFixed(2), stateNow.y.toFixed(2), stateNow.z.toFixed(2), 'km');
    console.log('     vel:', stateNow.vx.toFixed(4), stateNow.vy.toFixed(4), stateNow.vz.toFixed(4), 'km/s');
    console.log('     |r|:', Math.sqrt(stateNow.x ** 2 + stateNow.y ** 2 + stateNow.z ** 2).toFixed(2), 'km');
    console.log('     |v|:', Math.sqrt(stateNow.vx ** 2 + stateNow.vy ** 2 + stateNow.vz ** 2).toFixed(4), 'km/s');
    console.log('     frame:', stateNow.frame);

    console.log('\n   At +1h:');
    console.log('     pos:', stateFuture.x.toFixed(2), stateFuture.y.toFixed(2), stateFuture.z.toFixed(2), 'km');
    console.log('     |r|:', Math.sqrt(stateFuture.x ** 2 + stateFuture.y ** 2 + stateFuture.z ** 2).toFixed(2), 'km');
    const distMoved = Math.sqrt(
      (stateFuture.x - stateNow.x) ** 2 +
      (stateFuture.y - stateNow.y) ** 2 +
      (stateFuture.z - stateNow.z) ** 2
    );
    console.log('     distance moved in 1h:', distMoved.toFixed(2), 'km');
    console.log('     expected (from speed):', (Math.sqrt(stateNow.vx ** 2 + stateNow.vy ** 2 + stateNow.vz ** 2) * 3600).toFixed(2), 'km');
  } catch (e: any) {
    console.error('   Propagation failed:', e.message);
  }

  console.log('\n--- SGP4 test complete ---');
}

main().catch(e => { console.error(e); process.exit(1); });
