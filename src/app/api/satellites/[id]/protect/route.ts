import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/satellites/[id]/protect
// Mark a satellite as "protected" (part of the operator's fleet).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sat = await db.satellite.findUnique({ where: { id: String(id) } });
  if (!sat) return NextResponse.json({ error: 'Satellite not found' }, { status: 404 });
  const updated = await db.satellite.update({
    where: { id: String(id) },
    data: { isProtected: true },
  });
  return NextResponse.json({ satellite: { id: updated.id, name: updated.name, isProtected: updated.isProtected } });
}

// DELETE /api/satellites/[id]/protect
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sat = await db.satellite.findUnique({ where: { id: String(id) } });
  if (!sat) return NextResponse.json({ error: 'Satellite not found' }, { status: 404 });
  const updated = await db.satellite.update({
    where: { id: String(id) },
    data: { isProtected: false },
  });
  return NextResponse.json({ satellite: { id: updated.id, name: updated.name, isProtected: updated.isProtected } });
}
