import { NextResponse } from 'next/server';
import { simulateManeuver } from '@/lib/services';

export const dynamic = 'force-dynamic';

async function generateGeminiRecommendation(simulation: unknown): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are a cautious satellite flight-dynamics decision-support analyst.
Review the following deterministic maneuver simulation JSON and write a concise operational recommendation.
Use only the supplied values. Do not invent orbital data, collision probability, or commands.
Mention the best simulated option, timing, delta-v, risk change, miss distance, and any secondary conjunctions.
State clearly that this is simulation-only decision support and requires qualified operators.
Return plain text with short paragraphs or bullets, no markdown heading.

SIMULATION JSON:
${JSON.stringify(simulation)}`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 500 },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok) return null;
    const body = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch {
    return null;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const sim = await simulateManeuver(id, body.scenarios);
  if (!sim) return NextResponse.json({ error: 'Conjunction not found' }, { status: 404 });
  const aiRecommendation = await generateGeminiRecommendation(sim);
  return NextResponse.json({
    simulation: aiRecommendation ? { ...sim, recommendation: aiRecommendation } : sim,
    recommendationSource: aiRecommendation ? 'GEMINI' : 'DETERMINISTIC_FALLBACK',
  });
}
