import { NextResponse } from 'next/server';
import { ensureDemoSeeded } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (process.env.ALLOW_DEMO_DATA !== 'true') {
    return NextResponse.json({ error: 'Demo data is disabled. Set ALLOW_DEMO_DATA=true explicitly for evaluation.' }, { status: 403 });
  }
  // Force-reseed: clear DB and reload demo dataset
  const { db } = await import('@/lib/db');
  await db.conjunction.deleteMany();
  await db.analysisReport.deleteMany();
  await db.satellite.deleteMany();
  await ensureDemoSeeded();
  return NextResponse.json({ ok: true, message: 'Demo dataset re-seeded.' });
}
