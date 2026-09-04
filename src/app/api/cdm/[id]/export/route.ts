import { NextResponse } from 'next/server';
import { exportCdm } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const text = await exportCdm(id);
    return new NextResponse(text, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="cdm-${id}.txt"` },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
}
