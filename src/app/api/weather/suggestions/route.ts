import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type WeatherInputs = Record<string, number | string | undefined>;

interface SuggestionRequest {
  weather?: WeatherInputs;
  prediction?: {
    risk_level?: string;
    risk_score?: number;
    explanation?: string;
  };
  mode?: 'live' | 'manual';
}

function toFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeWeather(weather: WeatherInputs = {}) {
  return Object.fromEntries(
    Object.entries(weather).flatMap(([key, value]) => {
      const number = toFiniteNumber(value);
      return number === undefined ? [] : [[key, number]];
    }),
  );
}

function parseSuggestions(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini is not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null) as SuggestionRequest | null;
  if (!body?.weather || !body.prediction) {
    return NextResponse.json({ error: 'Weather readings and prediction are required.' }, { status: 400 });
  }

  const weather = normalizeWeather(body.weather);
  const prediction = {
    risk_level: body.prediction.risk_level?.toUpperCase() || 'UNKNOWN',
    risk_score: toFiniteNumber(body.prediction.risk_score) ?? 0,
    explanation: body.prediction.explanation?.slice(0, 800) || 'No model explanation supplied.',
  };

  const prompt = `You are a cautious space-weather operations decision-support assistant.
Using only the supplied telemetry and model prediction, write exactly 3 concise, actionable suggestions for a satellite operations team. Each suggestion must connect to a relevant supplied value when possible. Do not invent events, measurements, commands, or certainty. Do not provide medical, legal, or financial advice. Treat this as decision support, not an autonomous command authority. Return plain text only: one bullet per line, no heading.

Mode: ${body.mode === 'manual' ? 'operator-supplied manual scenario' : 'live telemetry'}
Prediction: ${JSON.stringify(prediction)}
Telemetry: ${JSON.stringify(weather)}`;

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.25, maxOutputTokens: 512 },
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ error: 'Gemini could not generate suggestions.' }, { status: 502 });
    }

    const result = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const suggestions = parseSuggestions(result.candidates?.[0]?.content?.parts?.[0]?.text || '');
    if (suggestions.length === 0) {
      return NextResponse.json({ error: 'Gemini returned no usable suggestions.' }, { status: 502 });
    }

    return NextResponse.json({ suggestions, source: 'GEMINI', generatedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({ error: 'Unable to reach Gemini.' }, { status: 502 });
  }
}
