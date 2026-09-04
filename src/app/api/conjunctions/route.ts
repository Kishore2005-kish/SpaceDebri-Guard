import { NextResponse } from 'next/server';
import { listConjunctions } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const primaryId = url.searchParams.get('primaryId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const riskLevel = url.searchParams.get('riskLevel') ?? undefined;
  const minRisk = url.searchParams.get('minRisk') ? parseInt(url.searchParams.get('minRisk')!, 10) : undefined;
  const maxDistance = url.searchParams.get('maxDistance') ? parseFloat(url.searchParams.get('maxDistance')!) : undefined;
  const type = url.searchParams.get('type') ?? undefined;
  const minConf = url.searchParams.get('minConf') ? parseInt(url.searchParams.get('minConf')!, 10) : undefined;
  let conj = await listConjunctions({ primaryId, status, riskLevel });
  if (minRisk !== undefined) conj = conj.filter(c => c.riskScore >= minRisk);
  if (maxDistance !== undefined) conj = conj.filter(c => c.minRange <= maxDistance);
  if (type) conj = conj.filter(c => c.secondaryObjectType === type);
  if (minConf !== undefined) conj = conj.filter(c => c.confidenceScore >= minConf);
  return NextResponse.json({ conjunctions: conj });
}
