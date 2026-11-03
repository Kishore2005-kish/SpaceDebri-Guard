import { NextResponse } from 'next/server';
import { ensureDemoSeeded } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (process.env.ALLOW_DEMO_DATA !== 'true') {
    return NextResponse.json({ error: 'Demo data is disabled. Set ALLOW_DEMO_DATA=true explicitly for evaluation.' }, { status: 403 });
  }
  // Force-reseed only the synthetic fixtures. Live catalog data and its
  // analysis history must survive a demo refresh.
  const { db } = await import('@/lib/db');
  await db.conjunction.deleteMany({ where: { dataSource: 'SENTINEL-DEMO' } });
  await db.satellite.deleteMany({ where: { source: 'SENTINEL-DEMO' } });
  await db.catalogSnapshot.deleteMany({ where: { source: 'SENTINEL-DEMO' } });
  await ensureDemoSeeded();
  return NextResponse.json({ ok: true, message: 'Demo dataset re-seeded.' });
}
