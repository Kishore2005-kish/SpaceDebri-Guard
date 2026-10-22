import { buildDemoDataset, DemoSatellite } from '../../../src/lib/demo/data';
import { screen } from '../../../src/lib/orbital/conjunction';
import type { OrbitalObject } from '../../../src/lib/data/celestrak/types';

const NOW = new Date('2026-10-22T00:00:00.000Z');
function toObject(d: DemoSatellite): OrbitalObject {
  const e = d.elements;
  return { catalogId: d.id, name: d.name, objectType: d.objectType, epoch: e.epoch.toISOString(), meanMotion: e.meanMotion, eccentricity: e.eccentricity, inclination: e.inclination, raOfAscendingNode: e.raan, argumentOfPerigee: e.argPerigee, meanAnomaly: e.meanAnomaly, bstar: e.bstar, source: 'SENTINEL-DEMO', retrievedAt: NOW.toISOString(), format: 'OMM', rawDataHash: d.rawHash };
}
const dataset = buildDemoDataset(NOW);
const objects = new Map(dataset.satellites.map((s) => [s.id, toObject(s)]));
const scenarios = [
  { id: 'synthetic-showcase', primary: 'MYSAT-01', secondary: 'DBR-2841', start: '2026-10-22T00:00:00Z', end: '2026-10-26T00:00:00Z', thresholdKm: 5, expected: 'detect', expectedTca: '2026-10-25T00:00:00Z', expectedRangeKm: 0.15 },
  { id: 'synthetic-crossing', primary: 'EAST-WEST-01', secondary: 'NORTH-SOUTH-X', start: '2026-10-22T00:00:00Z', end: '2026-10-24T00:00:00Z', thresholdKm: 5, expected: 'detect', expectedTca: '2026-10-23T12:00:00Z', expectedRangeKm: 0.25 },
  { id: 'synthetic-safe-pair', primary: 'MYSAT-01', secondary: 'IRIDIUM-33-DBR', start: '2026-10-22T00:00:00Z', end: '2026-10-23T00:00:00Z', thresholdKm: 5, expected: 'no-detect' },
];
const results = scenarios.map((s) => {
  try {
    const result = screen(objects.get(s.primary)!, objects.get(s.secondary)!, new Date(s.start), new Date(s.end), s.thresholdKm);
    return { ...s, detected: Boolean(result), result: result ? { tca: result.tca.toISOString(), minRangeKm: result.minRange, relVelocityKmPerSec: result.relVelocity, screeningStart: result.screeningStart.toISOString(), screeningEnd: result.screeningEnd } : null };
  } catch (error) { return { ...s, detected: false, error: error instanceof Error ? error.message : String(error) }; }
});
process.stdout.write(JSON.stringify({ now: NOW.toISOString(), scenarios: results }));
