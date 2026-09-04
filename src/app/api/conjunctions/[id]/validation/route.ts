import { NextResponse } from 'next/server';
import { getValidation } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const val = await getValidation(id);
    return NextResponse.json({ validation: val });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 404 });
  }
}
