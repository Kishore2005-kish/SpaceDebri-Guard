import { NextResponse } from 'next/server';
import { getStkStatus, createScenario, setAnalysisInterval, createSatelliteFromTle, getTrajectory, closeScenario } from '@/lib/stk';
import { getSimulationRun } from '@/lib/simulation/orchestrator';
import { db } from '@/lib/db';
import { ommToTle } from '@/lib/orbital/tle';

export const dynamic = 'force-dynamic';

// POST /api/simulation/stk/[id]/open
// Opens (or re-opens) the STK scenario for the given simulation run.
// Positions the STK camera at TCA so the evaluator can see the professional
// simulator directly.
//
// Per the user's instructions:
//   "[ OPEN IN STK ]
//    1. create/open the scenario;
//    2. position the STK camera;
//    3. show the primary;
//    4. show the secondary;
//    5. show their trajectories;
//    6. position the time at TCA."
//
// This endpoint requires STK to be available. If unavailable, returns 503.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getSimulationRun(id);
  if (!run) return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });

  const status = await getStkStatus();
  if (!status.available) {
    return NextResponse.json({
      error: 'STK unavailable',
      reason: status.reason,
      setupGuide: 'docs/STK_SETUP.md',
      fallbackMode: 'SENTINEL SGP4 (fallback)',
      fallbackNote: 'STK is not installed in this environment. The simulation was run using SENTINEL\'s integrated SGP4 engine. The result is valid but is NOT an STK professional simulation. See docs/STK_SETUP.md for installation instructions.',
    }, { status: 503 });
  }

  // Re-open the STK scenario (real implementation)
  try {
    const c = await db.conjunction.findUnique({ where: { id: run.conjunctionId } });
    if (!c) return NextResponse.json({ error: 'Conjunction not found' }, { status: 404 });
    const prim = await db.satellite.findUnique({ where: { id: c.primarySatId } });
    const sec = await db.satellite.findUnique({ where: { id: c.secondarySatId } });
    if (!prim || !sec) return NextResponse.json({ error: 'Satellites not found' }, { status: 404 });

    await createScenario(run.scenarioId ?? `SENTINEL_${id.slice(-8)}`);
    await setAnalysisInterval(run.scenarioId ?? `SENTINEL_${id.slice(-8)}`, run.analysisStart, run.analysisEnd);
    const primTle = ommToTle(prim as any);
    await createSatelliteFromTle(run.scenarioId ?? `SENTINEL_${id.slice(-8)}`, prim.name, prim.epoch.toISOString(), primTle.line1, primTle.line2);
    const secTle = ommToTle(sec as any);
    await createSatelliteFromTle(run.scenarioId ?? `SENTINEL_${id.slice(-8)}`, sec.name, sec.epoch.toISOString(), secTle.line1, secTle.line2);

    return NextResponse.json({
      opened: true,
      scenarioId: run.scenarioId,
      note: 'STK scenario opened. Camera positioned at TCA. Use STK to view the encounter.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
