import { NextResponse } from 'next/server';
import { listRecordings, saveRecording } from '@/lib/supabase/recordings';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try { const limit = Number(new URL(req.url).searchParams.get('limit') ?? 50); return NextResponse.json({ items: await listRecordings(Number.isFinite(limit) ? limit : 50) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load recordings' }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.recordType || body.payload === undefined) return NextResponse.json({ error: 'recordType and payload are required' }, { status: 400 });
    return NextResponse.json({ item: await saveRecording(body) }, { status: 201 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save recording' }, { status: 500 }); }
}

