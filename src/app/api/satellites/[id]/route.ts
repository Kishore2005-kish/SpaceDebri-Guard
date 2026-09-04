import { NextResponse } from 'next/server';
import { getSatellite } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sat = await getSatellite(id);
  if (!sat) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ satellite: sat });
}
