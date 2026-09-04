import { NextResponse } from 'next/server';
import { listSatellites, registerSatellite, refreshFromCelesTrak, ensureDemoSeeded } from '@/lib/services';

export const dynamic = 'force-dynamic';

// GET /api/satellites
// Query params:
//   protected=1   — only protected satellites
//   source=CelesTrak|SENTINEL-DEMO
//   type=PAYLOAD|DEBRIS|ROCKET_BODY|UNKNOWN
//   q=search-string
export async function GET(req: Request) {
  const url = new URL(req.url);
  const protectedOnly = url.searchParams.get('protected');
  const source = url.searchParams.get('source') ?? undefined;
  const objectType = url.searchParams.get('type');
  const query = url.searchParams.get('q')?.toLowerCase();
  let sats = await listSatellites(protectedOnly === '1' ? true : undefined, source);
  if (objectType) sats = sats.filter(s => s.objectType === objectType);
  if (query) sats = sats.filter(s => s.name.toLowerCase().includes(query) || s.id.toLowerCase().includes(query));
  return NextResponse.json({ satellites: sats });
}

// POST /api/satellites
// Register a new object (operator-provided elements). Marks source = 'OPERATOR'.
export async function POST(req: Request) {
  const body = await req.json();
  try {
    const sat = await registerSatellite(body);
    return NextResponse.json({ satellite: sat }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
