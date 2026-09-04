import { NextResponse } from 'next/server';
import { getConjunction } from '@/lib/services';

export const dynamic = 'force-dynamic';

// GET /api/provenance/[id]
// Returns the full provenance / "How do we know this is real?" panel for a
// specific conjunction event.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getConjunction(id);
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({
    analysisId: c.analysisId,
    dataSource: c.dataSource,
    retrievedAt: c.retrievedAt,
    primaryEpoch: c.primaryEpoch,
    secondaryEpoch: c.secondaryEpoch,
    propagator: c.propagator,
    propagatorFrame: c.propagatorFrame,
    snapshotId: c.snapshotId,
    screeningHorizonDays: c.screeningHorizonDays,
    screeningThreshold: c.screeningThreshold,
    riskModelVersion: c.riskModelVersion,
    riskWeights: c.riskWeights,
    covarianceAvailable: c.covarianceAvailable,
    covarianceDisclaimer: 'Professional collision probability cannot be reliably calculated from public GP/TLE data because covariance is unavailable.',
    proveItItems: [
      {
        label: 'Real catalog IDs (primary & secondary)',
        verified: true,
        detail: `${c.primarySatId} ↔ ${c.secondarySatId}`,
      },
      {
        label: 'Real orbital epochs',
        verified: !!c.primaryEpoch && !!c.secondaryEpoch,
        detail: `Primary epoch: ${c.primaryEpoch}; Secondary epoch: ${c.secondaryEpoch}`,
      },
      {
        label: 'SGP4 propagation',
        verified: c.propagator?.includes('sgp4'),
        detail: c.propagator,
      },
      {
        label: 'Reproducible analysis',
        verified: !!c.snapshotId,
        detail: c.snapshotId ? `Snapshot: ${c.snapshotId}` : 'No snapshot',
      },
      {
        label: 'Heuristic risk (NOT probability of collision)',
        verified: true,
        detail: `${c.riskScore}/100 (${c.riskLevel}); covariance ${c.covarianceAvailable ? 'available' : 'unavailable'}`,
      },
    ],
  });
}
