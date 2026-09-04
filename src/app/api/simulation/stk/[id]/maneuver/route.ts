import { NextResponse } from 'next/server';
import { startManeuverSimulation } from '@/lib/simulation/orchestrator';

export const dynamic = 'force-dynamic';

// POST /api/simulation/stk/[id]/maneuver
// Body: { hoursBeforeTca: number, deltaV: number (m/s), direction: 'RADIAL'|'ALONG_TRACK'|'CROSS_TRACK' }
//
// Starts a new simulation run with the hypothetical maneuver applied.
// The original conjunction is unchanged — the maneuver produces a temporary
// simulated state. The result includes the new TCA / miss distance for
// comparison with the baseline.
//
// Per the user's instructions:
//   "The maneuver must NOT modify the stored real catalog object.
//    Create a temporary simulated state."
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  if (!body.hoursBeforeTca || !body.deltaV || !body.direction) {
    return NextResponse.json({ error: 'hoursBeforeTca, deltaV, direction required' }, { status: 400 });
  }
  // Get the conjunctionId from the existing simulation run
  // (We use the original conjunction as the basis for the maneuvered simulation.)
  const { getSimulationRun } = await import('@/lib/simulation/orchestrator');
  const existing = await getSimulationRun(id);
  if (!existing) return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
  try {
    const result = await startManeuverSimulation(existing.conjunctionId, {
      hoursBeforeTca: body.hoursBeforeTca,
      deltaV: body.deltaV,
      direction: body.direction,
    });
    return NextResponse.json(result, { status: 202 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
