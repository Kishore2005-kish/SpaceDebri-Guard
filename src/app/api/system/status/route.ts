import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getStkStatus } from '@/lib/stk/service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET /api/system/status
// Developer status page — shows system health for debugging
export async function GET() {
  const checks: any = {};

  // Database
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    checks.database = { status: 'READY', latencyMs: Date.now() - start };
  } catch (e: any) {
    checks.database = { status: 'ERROR', error: e.message };
  }

  // CelesTrak
  try {
    const liveCount = await db.satellite.count({ where: { source: 'CelesTrak' } });
    const latestRefresh = await db.dataRefreshLog.findFirst({ orderBy: { retrievedAt: 'desc' } });
    checks.celesTrak = {
      status: liveCount > 0 ? (latestRefresh ? 'CACHED' : 'ERROR') : 'NO_DATA',
      objects: liveCount,
      lastRefresh: latestRefresh?.retrievedAt.toISOString() ?? null,
    };
  } catch (e: any) {
    checks.celesTrak = { status: 'ERROR', error: e.message };
  }

  // SGP4
  checks.sgp4 = { status: 'READY', version: 'sgp4 npm@1.0.10' };

  // Cesium
  checks.cesium = { status: 'READY', version: 'cesium@1.144.0' };

  // STK
  try {
    const stk = await getStkStatus();
    checks.stk = {
      status: stk.available ? 'AVAILABLE' : 'UNAVAILABLE',
      version: stk.version,
      reason: stk.reason,
    };
  } catch {
    checks.stk = { status: 'UNAVAILABLE' };
  }

  // AI
  checks.ai = { status: 'READY', engine: 'z-ai-web-dev-sdk' };

  // Data counts
  try {
    checks.data = {
      totalObjects: await db.satellite.count(),
      liveObjects: await db.satellite.count({ where: { source: 'CelesTrak' } }),
      demoObjects: await db.satellite.count({ where: { source: 'SENTINEL-DEMO' } }),
      conjunctions: await db.conjunction.count({}),
      simulations: await db.simulationRun.count({}),
      analyses: await db.analysisRun.count({}),
    };
  } catch (e: any) {
    checks.data = { status: 'ERROR', error: e.message };
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    checks,
  });
}
