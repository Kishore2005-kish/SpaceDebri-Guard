// Quick debug script: verify that the showcase conjunction is detected.
import { buildDemoDataset } from '@/lib/demo/data';
import { screen } from '@/lib/orbital/conjunction';
import { propagate, relativeMotion } from '@/lib/orbital/propagator';

const now = new Date();
const { satellites, showcasePrimaryId, showcaseSecondaryId } = buildDemoDataset(now);
const primary = satellites.find(s => s.id === showcasePrimaryId)!;
const secondary = satellites.find(s => s.id === showcaseSecondaryId)!;
console.log('Primary:', primary.name, 'epoch:', primary.elements.epoch.toISOString());
console.log('  inc:', primary.elements.inclination, 'raan:', primary.elements.raan, 'M:', primary.elements.meanAnomaly);
console.log('Secondary:', secondary.name, 'epoch:', secondary.elements.epoch.toISOString());
console.log('  inc:', secondary.elements.inclination, 'raan:', secondary.elements.raan, 'M:', secondary.elements.meanAnomaly);

// Propagate primary to its TCA (target was 72h from now, secondary's epoch)
const tca = secondary.elements.epoch;
console.log('\nTarget TCA:', tca.toISOString());
const ps = propagate(primary.elements, tca);
const ss = propagate(secondary.elements, tca);
console.log('Primary at TCA:', ps.x.toFixed(2), ps.y.toFixed(2), ps.z.toFixed(2), '|v|', Math.sqrt(ps.vx**2 + ps.vy**2 + ps.vz**2).toFixed(3));
console.log('Secondary at TCA:', ss.x.toFixed(2), ss.y.toFixed(2), ss.z.toFixed(2), '|v|', Math.sqrt(ss.vx**2 + ss.vy**2 + ss.vz**2).toFixed(3));
const rel = relativeMotion(ps, ss);
console.log('Range at TCA:', rel.range.toFixed(4), 'km');
console.log('Rel vel at TCA:', rel.relVel.toFixed(3), 'km/s');

// Now run the screening
const start = new Date(now.getTime());
const end = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
console.log('\nRunning screen from', start.toISOString(), 'to', end.toISOString());
const result = screen(primary.elements, secondary.elements, start, end, 5);
if (result) {
  console.log('Conjunction detected!');
  console.log('  TCA:', result.tca.toISOString());
  console.log('  Min range:', result.minRange.toFixed(4), 'km');
  console.log('  Rel vel:', result.relVelocity.toFixed(3), 'km/s');
} else {
  console.log('NO conjunction detected within 7 days');
  // Sample at coarse 30-min steps and find the closest approach
  let minRange = Infinity;
  let minT: Date | null = null;
  for (let ms = start.getTime(); ms <= end.getTime(); ms += 30 * 60 * 1000) {
    const t = new Date(ms);
    const p = propagate(primary.elements, t);
    const s = propagate(secondary.elements, t);
    const r = relativeMotion(p, s);
    if (r.range < minRange) {
      minRange = r.range;
      minT = t;
    }
  }
  console.log('Coarse min range:', minRange.toFixed(4), 'km at', minT?.toISOString());
}
