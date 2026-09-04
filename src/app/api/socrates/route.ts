import { NextResponse } from 'next/server';
import { fetchSocratesReference } from '@/lib/data/celestrak';
import { db } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

// GET /api/socrates
// Fetches the public CelesTrak SOCRATES reference data and stores it for
// comparison against our screening results.
//
// Per https://www.celestrak.org/SOCRATES/socrates-format.php:
//   "SOCRATES (Satellite Orbital Conjunction Reports Assessing Threatening
//    Encounters in Space) is a service that provides routine assessment of
//    possible satellite conjunctions."
//   SOCRATES is NOT ground truth — it is an independent reference.
export async function GET() {
  const result = await fetchSocratesReference();
  // Store the SOCRATES reference in the database as an AnalysisReport
  const report = await db.analysisReport.create({
    data: {
      reportType: 'SOCRATES_REFERENCE',
      contentJson: JSON.stringify({
        url: result.url,
        retrievedAt: result.retrievedAt,
        recordCount: result.records.length,
        records: result.records.slice(0, 50),  // store first 50 for display
        errors: result.errors,
        analysisId: uuidv4(),
      }),
    },
  });
  return NextResponse.json({
    reportId: report.id,
    url: result.url,
    retrievedAt: result.retrievedAt,
    recordCount: result.records.length,
    records: result.records.slice(0, 50),  // return first 50 for the UI
    errors: result.errors,
    note: 'SOCRATES is an independent public reference, NOT ground truth. Used for validation only.',
  });
}

// Compare our screening results against SOCRATES
export async function POST(req: Request) {
  const body = await req.json();
  const { conjunctionId } = body;
  if (!conjunctionId) return NextResponse.json({ error: 'conjunctionId required' }, { status: 400 });
  // Fetch our conjunction
  const c = await db.conjunction.findUnique({ where: { id: conjunctionId } });
  if (!c) return NextResponse.json({ error: 'Conjunction not found' }, { status: 404 });
  // Fetch SOCRATES reference (live)
  const socrates = await fetchSocratesReference();
  // Try to find a matching record (by primary + secondary catalog ID)
  const match = socrates.records.find(r =>
    (r.primaryCatalogId === c.primarySatId && r.secondaryCatalogId === c.secondarySatId) ||
    (r.primaryCatalogId === c.secondarySatId && r.secondaryCatalogId === c.primarySatId)
  );
  if (!match) {
    return NextResponse.json({
      detected: false,
      note: 'No matching event in SOCRATES (this does not mean our result is wrong — SOCRATES only publishes the top ~200 events)',
      ourTca: c.tca.toISOString(),
      ourMinRangeKm: c.minRange,
      ourRelVel: c.relVelocity,
      socratesRecordsCount: socrates.records.length,
      socratesRetrievedAt: socrates.retrievedAt,
    });
  }
  const tcaErr = Math.abs((c.tca.getTime() - Date.parse(match.tca)) / 60000);
  const rangeErr = Math.abs(c.minRange - match.minRangeKm);
  await db.conjunction.update({
    where: { id: conjunctionId },
    data: {
      validationReference: 'CelesTrak SOCRATES',
      validationDetected: true,
      validationTcaErrorMin: tcaErr,
      validationRangeErrorKm: rangeErr,
    },
  });
  return NextResponse.json({
    detected: true,
    reference: 'CelesTrak SOCRATES',
    referenceTca: match.tca,
    referenceRangeKm: match.minRangeKm,
    referenceRelVel: match.relativeVelocityKmPerSec,
    ourTca: c.tca.toISOString(),
    ourMinRangeKm: c.minRange,
    ourRelVel: c.relVelocity,
    tcaErrorMin: tcaErr,
    rangeErrorKm: rangeErr,
    socratesRetrievedAt: socrates.retrievedAt,
    note: 'SOCRATES is an independent reference, not ground truth.',
  });
}
