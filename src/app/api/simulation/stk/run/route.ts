import { NextResponse } from 'next/server';
import { startSimulation } from '@/lib/simulation/orchestrator';

export const dynamic = 'force-dynamic';

// POST /api/simulation/stk/run
// Body: { conjunctionId: string }
//
// Starts a STK (or SGP4 fallback) simulation for the given conjunction.
// Returns immediately with a simulationId — the actual analysis runs async.
// Frontend polls GET /api/simulation/stk/[id] for status updates.
//
// Per the user's instructions:
//   "STK analysis can take time. Run it as a background job.
//    Frontend: POST simulation returns simulationId.
//    Then: GET simulation/[id] polls or streams status.
//    Do not keep a synchronous HTTP request open while STK performs a long calculation."
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.conjunctionId) {
    return NextResponse.json({ error: 'conjunctionId required' }, { status: 400 });
  }
  try {
    const result = await startSimulation(body.conjunctionId);
    return NextResponse.json(result, { status: 202 });  // 202 Accepted
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
