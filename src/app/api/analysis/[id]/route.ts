import { NextResponse } from 'next/server';
import { getAnalysisRun, cancelAnalysis } from '@/lib/simulation/analysis';

export const dynamic = 'force-dynamic';

// GET /api/analysis/[id]
// Poll for analysis status + progress.
// Returns: { id, status, progress, progressMessage, conjunctionsFound, ... }
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getAnalysisRun(id);
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ analysis: run });
}

// DELETE /api/analysis/[id]
// Cancel a running analysis.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cancelled = await cancelAnalysis(id);
  if (!cancelled) return NextResponse.json({ error: 'Could not cancel (not found or already complete)' }, { status: 400 });
  return NextResponse.json({ ok: true, message: 'Analysis cancelled' });
}
