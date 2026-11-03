import { NextResponse } from 'next/server';
import { getConjunction, listDemoConjunctionsFallback } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let c;
  try {
    c = await getConjunction(id);
  } catch (error) {
    console.warn('Conjunction database unavailable; returning demo conjunction detail.', error);
    c = listDemoConjunctionsFallback().find(item => item.id === String(id)) ?? null;
  }
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ conjunction: c });
}
