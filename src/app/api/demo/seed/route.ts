import { NextResponse } from 'next/server';
import { ensureDemoSeeded } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST() {
  // Force-reseed: clear DB and reload demo dataset
  const { db } = await import('@/lib/db');
  await db.conjunction.deleteMany();
  await db.analysisReport.deleteMany();
  await db.satellite.deleteMany();
  await ensureDemoSeeded();
  return NextResponse.json({ ok: true, message: 'Demo dataset re-seeded.' });
}
