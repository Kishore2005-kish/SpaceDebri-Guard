import { NextResponse } from 'next/server';
import { runScreening } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await runScreening({
    primaryIds: body.primaryIds,
    screeningHorizonDays: body.screeningHorizonDays ?? 7,
    thresholdKm: body.thresholdKm ?? 5,
  });
  return NextResponse.json(result);
}
