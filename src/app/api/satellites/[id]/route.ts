import { NextResponse } from 'next/server';
import { getSatellite, listDemoSatellitesFallback } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let sat;
  try {
    sat = await getSatellite(id);
  } catch (error) {
    console.warn('Satellite database unavailable; returning demo satellite detail.', error);
    sat = listDemoSatellitesFallback().find(item => item.id === String(id)) ?? null;
  }
  if (!sat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ satellite: sat });
}
