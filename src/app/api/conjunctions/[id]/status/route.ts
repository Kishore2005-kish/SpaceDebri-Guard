import { NextResponse } from 'next/server';
import { updateConjunctionStatus } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  await updateConjunctionStatus(id, body.status, body.note);
  return NextResponse.json({ ok: true });
}
