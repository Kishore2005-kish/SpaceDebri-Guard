import { NextResponse } from 'next/server';
import { refreshFromCelesTrak, ensureDemoSeeded } from '@/lib/services';

export const dynamic = 'force-dynamic';

// POST /api/orbits/refresh
// Body: { groups?: string[] }  — default ['stations']
//
// Fetches real orbital data from CelesTrak, validates, normalizes, upserts,
// creates a snapshot, and logs the refresh attempt.
//
// Returns:
//   - source, retrievedAt, url
//   - objectsImported, objectsUpdated
//   - parseErrors (array)
//   - durationMs, snapshotId
//   - totalObjectsInCatalog
//   - status: OK | FETCH_ERROR | PARSE_ERROR | PARTIAL
export async function POST(req: Request) {
  let body: any = {};
  try { body = await req.json(); } catch {}
  const groups = body.groups ?? ['stations'];
  // If the caller requested demo mode, just seed demo data
  if (body.demo === true) {
    await ensureDemoSeeded();
    return NextResponse.json({
      source: 'SENTINEL-DEMO',
      retrievedAt: new Date().toISOString(),
      objectsImported: 0,
      objectsUpdated: 0,
      parseErrors: [],
      durationMs: 0,
      snapshotId: 'DEMO',
      totalObjectsInCatalog: 0,
      lastSuccessfulRefresh: new Date().toISOString(),
      status: 'OK' as const,
      note: 'Demo dataset (synthetic objects, clearly labeled)',
    });
  }
  const result = await refreshFromCelesTrak(groups);
  return NextResponse.json(result);
}

// GET /api/orbits/refresh — return the latest refresh logs
export async function GET() {
  const { listRefreshLogs } = await import('@/lib/services');
  const logs = await listRefreshLogs(20);
  return NextResponse.json({ logs });
}
