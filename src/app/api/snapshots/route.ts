import { NextResponse } from 'next/server';
import { listSnapshots, createSnapshot } from '@/lib/services';

export const dynamic = 'force-dynamic';

// GET /api/snapshots — list all catalog snapshots
export async function GET() {
  const snapshots = await listSnapshots();
  return NextResponse.json({ snapshots });
}

// POST /api/snapshots — create a new snapshot (timestamps the current catalog)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const snapshot = await createSnapshot(body.notes);
  return NextResponse.json({ snapshot }, { status: 201 });
}
