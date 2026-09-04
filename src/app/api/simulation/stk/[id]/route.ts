import { NextResponse } from 'next/server';
import { getSimulationRun } from '@/lib/simulation/orchestrator';

export const dynamic = 'force-dynamic';

// GET /api/simulation/stk/[id]
// Returns the current status of a simulation run (for polling).
// The frontend polls this endpoint every ~1s until status === 'COMPLETE' or 'FAILED'.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getSimulationRun(id);
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ simulation: run });
}
