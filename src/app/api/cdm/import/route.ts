import { NextResponse } from 'next/server';
import { importCdm } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const text = await req.text();
  const result = await importCdm(text);
  return NextResponse.json(result);
}
