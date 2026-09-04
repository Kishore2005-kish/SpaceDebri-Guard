import { NextResponse } from 'next/server';
import { propagateOrbit } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const start = url.searchParams.get('start') ?? new Date().toISOString();
  const end = url.searchParams.get('end') ?? new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const stepSec = parseInt(url.searchParams.get('step') ?? '60', 10);
  const states = await propagateOrbit(id, new Date(start), new Date(end), stepSec);
  return NextResponse.json({ states });
}
