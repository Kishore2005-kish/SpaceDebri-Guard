import { NextResponse } from 'next/server';
import { simulateManeuver } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sim = await simulateManeuver(id, body.scenarios);
  if (!sim) return NextResponse.json({ error: 'Conjunction not found' }, { status: 404 });
  return NextResponse.json({ simulation: sim });
}
