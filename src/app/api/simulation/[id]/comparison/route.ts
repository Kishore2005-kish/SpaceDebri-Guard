import { NextResponse } from 'next/server';
import { getEngineComparison } from '@/lib/simulation/orchestrator';

export const dynamic = 'force-dynamic';

// GET /api/simulation/[id]/comparison
// Returns the SENTINEL vs STK vs SOCRATES comparison for a simulation run.
//
// Per the user's instructions:
//   "When a conjunction is analyzed by both engines, display:
//    SENTINEL TCA / Miss distance ...
//    STK      TCA / Miss distance ...
//    Difference: TCA +/- X seconds, Range +/- X meters"
//
// This gives the evaluator evidence that SENTINEL is performing an actual
// orbital analysis rather than only displaying fabricated numbers.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const conjunctionId = url.searchParams.get('conjunctionId');
  if (!conjunctionId) return NextResponse.json({ error: 'conjunctionId query param required' }, { status: 400 });
  const comparison = await getEngineComparison(conjunctionId, id);
  return NextResponse.json(comparison);
}
