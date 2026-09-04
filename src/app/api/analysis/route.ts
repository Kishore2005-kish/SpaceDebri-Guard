import { NextResponse } from 'next/server';
import { startAnalysis, PRESETS, AnalysisConfig } from '@/lib/simulation/analysis';

export const dynamic = 'force-dynamic';

// POST /api/analysis
// Body: { config?: Partial<AnalysisConfig>, preset?: string }
//
// Starts a background analysis job. Returns immediately with an analysisId.
// The frontend polls GET /api/analysis/[id] for status updates.
//
// Presets:
//   QUICK — 24h, 10km, SGP4 only
//   STANDARD — 7d, 5km, SGP4
//   HIGH_PRECISION — STK enabled
//   CUSTOM — user-defined
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const preset = body.preset ?? 'CUSTOM';
  const presetConfig = PRESETS[preset]?.config ?? {};
  const userConfig: AnalysisConfig = {
    engine: 'SENTINEL_SGP4',
    collisionAssessmentMode: 'MISS_DISTANCE_ONLY',
    ...presetConfig,
    ...body.config,
  };
  try {
    const result = await startAnalysis(userConfig, preset);
    return NextResponse.json(result, { status: 202 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

// GET /api/analysis — list presets
export async function GET() {
  return NextResponse.json({
    presets: Object.entries(PRESETS).map(([key, p]) => ({
      key,
      name: p.name,
      description: p.description,
      config: p.config,
    })),
  });
}
