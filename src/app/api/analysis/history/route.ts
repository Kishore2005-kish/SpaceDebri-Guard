import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/analysis/history
// Returns lightweight history list (no giant JSON blobs)
// Query params: page, pageSize, status, engine, sort
export async function GET(req: Request) {
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
  const status = url.searchParams.get('status') ?? undefined;
  const engine = url.searchParams.get('engine') ?? undefined;
  const sort = url.searchParams.get('sort') ?? 'newest';

  const where: any = {};
  if (status) where.status = status;
  if (engine) where.engineUsed = engine;

  let orderBy: any[] = [{ startedAt: 'desc' }];
  if (sort === 'oldest') orderBy = [{ startedAt: 'asc' }];

  const [runs, total] = await Promise.all([
    db.analysisRun.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      // ONLY select lightweight fields — NO resultJson, rawReport, configJson
      select: {
        id: true,
        status: true,
        progress: true,
        progressMessage: true,
        startedAt: true,
        completedAt: true,
        preset: true,
        engineUsed: true,
        conjunctionsFound: true,
        candidatesFiltered: true,
        snapshotId: true,
      },
    }),
    db.analysisRun.count({ where }),
  ]);

  return NextResponse.json({
    items: runs.map(r => ({
      id: r.id,
      status: r.status,
      progress: r.progress,
      progressMessage: r.progressMessage,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      preset: r.preset,
      engineUsed: r.engineUsed,
      conjunctionsFound: r.conjunctionsFound,
      candidatesFiltered: r.candidatesFiltered,
      snapshotId: r.snapshotId,
    })),
    page,
    pageSize,
    total,
    hasNext: page * pageSize < total,
  });
}
