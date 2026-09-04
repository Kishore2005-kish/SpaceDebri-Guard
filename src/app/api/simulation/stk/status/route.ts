import { NextResponse } from 'next/server';
import { getStkStatus } from '@/lib/stk';

export const dynamic = 'force-dynamic';

// GET /api/simulation/stk/status
// Returns whether STK is available on this machine.
//
// STK availability = TCP socket to STK's Connect command port (localhost:5001)
// is open. We do NOT verify that STK is fully licensed or that Advanced CAT
// is available — those checks happen during actual scenario creation.
//
// If unavailable, the response explains why and points to docs/STK_SETUP.md.
export async function GET() {
  const status = await getStkStatus();
  return NextResponse.json({
    ...status,
    setupGuide: 'docs/STK_SETUP.md',
    fallbackMode: !status.available ? 'SENTINEL SGP4 (fallback)' : null,
    fallbackNote: !status.available
      ? 'STK unavailable. SENTINEL will run the integrated SGP4 simulation instead (clearly labeled as such).'
      : null,
  });
}
