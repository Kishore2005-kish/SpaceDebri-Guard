import fs from 'node:fs';
import { propagateSgp4 } from '../../../src/lib/orbital/sgp4';

const input = JSON.parse(fs.readFileSync(0, 'utf8')) as { cases: Array<{ id: string; object: any; timestamps: string[] }> };
const output = input.cases.map((testCase) => {
  const states = testCase.timestamps.map((timestamp) => {
    try {
      const state = propagateSgp4(testCase.object, new Date(timestamp));
      const values = [state.x, state.y, state.z, state.vx, state.vy, state.vz];
      if (!values.every(Number.isFinite)) return { timestamp, ok: false, error: 'non-finite output' };
      return { timestamp, ok: true, positionKm: [state.x, state.y, state.z], velocityKmPerSec: [state.vx, state.vy, state.vz], frame: state.frame };
    } catch (error) {
      return { timestamp, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  return { id: testCase.id, states };
});
process.stdout.write(JSON.stringify({ implementation: 'SpaceDebri-Guard npm sgp4@1.0.10', results: output }));
