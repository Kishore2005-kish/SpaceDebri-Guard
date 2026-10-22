import { db } from '../../../src/lib/db';

async function main() {
  const [satellites, conjunctions, analyses, recordings, latestSatellite, latestConjunction] = await Promise.all([
    db.satellite.count(),
    db.conjunction.count(),
    db.analysisRun.count(),
    db.recording.count(),
    db.satellite.findFirst({ orderBy: { epoch: 'desc' }, select: { id: true, name: true, source: true, epoch: true } }),
    db.conjunction.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true, status: true, minRange: true } }),
  ]);
  console.log(JSON.stringify({ satellites, conjunctions, analyses, recordings, latestSatellite, latestConjunction }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); })
  .finally(() => db.$disconnect());
