// API endpoint smoke tests.
// Run with: bun run scripts/test-api.ts
//
// Requires the dev server to be running on http://localhost:3000.
// Start it first: bun run dev (in another terminal)

const BASE = 'http://localhost:3000';

async function check(label: string, fn: () => Promise<any>, expected: boolean = true) {
  try {
    const result = await fn();
    const ok = !!result;
    if (ok === expected) {
      console.log(`  ✓ ${label}`);
    } else {
      console.error(`  ✗ ${label} (expected ${expected}, got ${result})`);
      process.exitCode = 1;
    }
  } catch (e: any) {
    console.error(`  ✗ ${label} (threw: ${e.message})`);
    process.exitCode = 1;
  }
}

async function get(path: string): Promise<any> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function post(path: string, body: any = {}): Promise<any> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

console.log('=== API endpoint tests ===\n');

console.log('1. GET /api/dashboard:');
await check('returns 200', async () => {
  const d = await get('/api/dashboard');
  return d && typeof d.protectedSatellites === 'number';
});

console.log('\n2. GET /api/status:');
await check('returns live/demo status', async () => {
  const s = await get('/api/status');
  return s && ['LIVE', 'CACHED', 'STALE', 'OFFLINE', 'DEMO'].includes(s.status);
});
await check('includes propagator info', async () => {
  const s = await get('/api/status');
  return s.propagator && s.propagator.includes('sgp4');
});

console.log('\n3. GET /api/evaluator:');
await check('returns prove-it panel data', async () => {
  const e = await get('/api/evaluator');
  return e && Array.isArray(e.proveIt) && e.proveIt.length > 0;
});
await check('includes system state', async () => {
  const e = await get('/api/evaluator');
  return e.systemState && typeof e.systemState.liveObjects === 'number';
});

console.log('\n4. GET /api/satellites:');
await check('returns array', async () => {
  const d = await get('/api/satellites');
  return d && Array.isArray(d.satellites);
});
await check('source filter works (CelesTrak)', async () => {
  const d = await get('/api/satellites?source=CelesTrak');
  return d.satellites.length > 0 && d.satellites.every((s: any) => s.source === 'CelesTrak');
});

console.log('\n5. GET /api/conjunctions:');
await check('returns array', async () => {
  const d = await get('/api/conjunctions');
  return d && Array.isArray(d.conjunctions);
});

console.log('\n6. GET /api/snapshots:');
await check('returns array', async () => {
  const d = await get('/api/snapshots');
  return d && Array.isArray(d.snapshots);
});

console.log('\n7. POST /api/screen (re-run screening):');
await check('returns screening result', async () => {
  const d = await post('/api/screen', {});
  return d && typeof d.totalEvents === 'number';
});

console.log('\n8. POST /api/orbits/refresh (refresh CelesTrak):');
await check('returns refresh result', async () => {
  const d = await post('/api/orbits/refresh', { groups: ['stations'] });
  return d && typeof d.objectsImported === 'number' && d.snapshotId;
}, true);

console.log('\n9. Get a specific conjunction:');
await check('conjunction detail returns provenance', async () => {
  const list = await get('/api/conjunctions');
  if (list.conjunctions.length === 0) return false;
  const id = list.conjunctions[0].id;
  const c = await get(`/api/conjunctions/${id}`);
  return c.conjunction && c.conjunction.propagator && c.conjunction.dataSource;
});

console.log('\n10. GET /api/provenance/{id}:');
await check('returns provenance details', async () => {
  const list = await get('/api/conjunctions');
  if (list.conjunctions.length === 0) return false;
  const id = list.conjunctions[0].id;
  const p = await get(`/api/provenance/${id}`);
  return p && p.analysisId && Array.isArray(p.proveItItems);
});

console.log('\n=== All API tests complete ===');
