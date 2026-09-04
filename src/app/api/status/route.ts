import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureDemoSeeded, PROPAGATOR_VERSION, PROPAGATOR_FRAME, RISK_MODEL_VERSION } from '@/lib/services';

export const dynamic = 'force-dynamic';

// GET /api/status
// Returns the current data-source status (LIVE / CACHED / DEMO / OFFLINE) and
// all the provenance metadata needed by the UI status panel.
export async function GET() {
  await ensureDemoSeeded();
  const total = await db.satellite.count({});
  const live = await db.satellite.count({ where: { source: 'CelesTrak' } });
  const demo = await db.satellite.count({ where: { source: 'SENTINEL-DEMO' } });
  const protectedCount = await db.satellite.count({ where: { isProtected: true } });
  const latestEpoch = await db.satellite.findFirst({ orderBy: { epoch: 'desc' } });
  const latestRefresh = await db.dataRefreshLog.findFirst({ orderBy: { retrievedAt: 'desc' } });
  const latestSnapshot = await db.catalogSnapshot.findFirst({ orderBy: { createdAt: 'desc' } });

  const dataAgeHours = latestEpoch ? (Date.now() - latestEpoch.epoch.getTime()) / 3600000 : 999;

  let status: 'LIVE' | 'CACHED' | 'STALE' | 'OFFLINE' | 'DEMO';
  if (live > 0 && dataAgeHours < 2) status = 'LIVE';
  else if (live > 0 && dataAgeHours < 24) status = 'CACHED';
  else if (live > 0) status = 'STALE';
  else if (demo > 0) status = 'DEMO';
  else status = 'OFFLINE';

  return NextResponse.json({
    status,
    source: live > 0 ? 'CelesTrak' : 'SENTINEL-DEMO',
    lastRefreshAt: latestRefresh?.retrievedAt.toISOString() ?? null,
    lastRefreshStatus: latestRefresh?.status ?? null,
    lastRefreshRecordsParsed: latestRefresh?.recordsParsed ?? 0,
    lastRefreshDurationMs: latestRefresh?.durationMs ?? 0,
    lastRefreshErrors: latestRefresh?.parseErrorsJson ? JSON.parse(latestRefresh.parseErrorsJson) : [],
    snapshotId: latestSnapshot?.id ?? null,
    snapshotCreatedAt: latestSnapshot?.createdAt.toISOString() ?? null,
    snapshotObjectCount: latestSnapshot?.objectCount ?? 0,
    totalObjects: total,
    liveObjects: live,
    demoObjects: demo,
    protectedObjects: protectedCount,
    latestEpoch: latestEpoch?.epoch.toISOString() ?? null,
    latestObjectName: latestEpoch?.name ?? null,
    latestObjectCatalogId: latestEpoch?.id ?? null,
    dataAgeHours,
    propagator: PROPAGATOR_VERSION,
    propagatorFrame: PROPAGATOR_FRAME,
    riskModelVersion: RISK_MODEL_VERSION,
  });
}
