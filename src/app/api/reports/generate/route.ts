import { NextResponse } from 'next/server';
import { generateReport } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json();
  const conjunctionId = body.conjunctionId;
  if (!conjunctionId) return NextResponse.json({ error: 'conjunctionId required' }, { status: 400 });
  try {
    const report = await generateReport(conjunctionId);
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
}
