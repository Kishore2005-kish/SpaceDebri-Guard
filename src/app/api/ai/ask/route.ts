import { NextResponse } from 'next/server';
import { getConjunction, getDashboardSummary, listConjunctions } from '@/lib/services';

export const dynamic = 'force-dynamic';

// AI assistant endpoint. Sends structured backend facts to the LLM and
// instructs it to ONLY explain those facts, never invent numbers, never
// authorize maneuvers.

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function POST(req: Request) {
  const body = await req.json();
  const question: string = body.question ?? '';
  const conjunctionId: string | undefined = body.conjunctionId;
  const history: ChatMessage[] = body.history ?? [];

  // Build a deterministic fact sheet
  let facts = '';
  if (conjunctionId) {
    const c = await getConjunction(conjunctionId);
    if (c) {
      facts = [
        `EVENT FACTS (read-only, do not invent additional numbers):`,
        `- Primary: ${c.primaryName} (${c.primarySatId})`,
        `- Secondary: ${c.secondaryName} (${c.secondarySatId}), type ${c.secondaryObjectType}`,
        `- TCA: ${c.tca}`,
        `- Min range: ${c.minRange.toFixed(3)} km`,
        `- Relative velocity: ${c.relVelocity.toFixed(2)} km/s`,
        `- Risk score: ${c.riskScore}/100 (${c.riskLevel})`,
        `- Confidence: ${c.confidenceScore}/100 (${c.confidenceLevel})`,
        `- Risk factors: ${c.riskFactors.map(f => `${f.label}=${(f.score * 100).toFixed(0)}`).join(', ')}`,
        `- Covariance available: ${c.covarianceAvailable ? 'yes' : 'no'}`,
        `- Data age: ${c.dataAgeHours.toFixed(1)} hours`,
        `- Disclaimer: ${c.disclaimer}`,
      ].join('\n');
    }
  } else {
    const summary = await getDashboardSummary();
    const conj = await listConjunctions();
    facts = [
      `MISSION FACTS (read-only):`,
      `- Protected satellites: ${summary.protectedSatellites}`,
      `- Total catalog objects: ${summary.totalObjects}`,
      `- Upcoming conjunctions: ${summary.upcomingConjunctions}`,
      `- Critical: ${summary.criticalCount}, High: ${summary.highCount}, Moderate: ${summary.moderateCount}, Low: ${summary.lowCount}`,
      `- Data source: ${summary.dataSource}`,
      `- Data freshness: ${summary.dataFreshnessHours.toFixed(1)} hours`,
      summary.nextCritical ? `- Next critical event TCA: ${summary.nextCritical.tca}, range ${summary.nextCritical.minRange.toFixed(2)} km, risk ${summary.nextCritical.riskScore}` : '- No critical events',
      summary.highestRisk ? `- Highest risk event: ${summary.highestRisk.primaryName} vs ${summary.highestRisk.secondaryName}, risk ${summary.highestRisk.riskScore}` : '',
      `- First 5 conjunctions: ${conj.slice(0, 5).map(c => `${c.primaryName}↔${c.secondaryName} (${c.riskScore})`).join('; ')}`,
    ].join('\n');
  }

  const systemPrompt = [
    'You are a strict conjunction-awareness assistant for a small-satellite operator decision-support prototype.',
    'You are NOT a flight controller. You can NEVER authorize, recommend execution of, or issue a flight command.',
    'Rules:',
    '1. Only explain the deterministic backend facts provided to you in this prompt.',
    '2. NEVER invent numbers, covariance, tracking accuracy, or spacecraft properties.',
    '3. NEVER calculate orbital mechanics. The backend has already done the math.',
    '4. If covariance is unavailable, say so. Do not estimate collision probability.',
    '5. If asked whether to execute a burn, say the system cannot authorize or issue flight commands.',
    '6. Use plain operator English. Keep answers under 200 words. Use bullet points when listing.',
    '7. Always end with the disclaimer: "Simulation only — not a flight command."',
    '',
    facts,
  ].join('\n');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: question },
  ];

  try {
    // Try to use the z-ai-web-dev-sdk LLM
    const ZAI = await import('z-ai-web-dev-sdk').then(m => m.default || m).catch(() => null);
    if (ZAI && typeof ZAI === 'function') {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages,
        temperature: 0.2,
        max_tokens: 600,
      });
      const answer = completion.choices?.[0]?.message?.content ?? '(no response)';
      return NextResponse.json({ answer, facts });
    }
    // Fallback: deterministic rule-based answers
    return NextResponse.json({ answer: ruleBasedAnswer(question, facts), facts });
  } catch (e: any) {
    return NextResponse.json({ answer: ruleBasedAnswer(question, facts), facts, error: e.message });
  }
}

function ruleBasedAnswer(question: string, facts: string): string {
  const q = question.toLowerCase();
  if (q.includes('what does tca')) {
    return [
      'TCA = Time of Closest Approach.',
      '',
      'It is the moment, within the screening window, when the relative distance between the primary and secondary objects is at its minimum.',
      '',
      'TCA is computed by sampling the propagated trajectories and refining around local minima — it is an estimate, not a precise prediction.',
      '',
      'Simulation only — not a flight command.',
    ].join('\n');
  }
  if (q.includes('why') && q.includes('risk')) {
    return [
      'Why this event is risky (from the deterministic backend facts):',
      '',
      '• The minimum miss distance is small relative to the screening threshold.',
      '• The relative velocity is high, so the encounter window is short and the energy in a hypothetical impact would be high.',
      '• Public GP/OMM data is not authoritative and covariance is unavailable, so the position uncertainty is large.',
      '• The orbital data may be several hours old, increasing uncertainty.',
      '',
      'The risk score is a prototype heuristic (not a collision probability).',
      '',
      'Simulation only — not a flight command.',
    ].join('\n');
  }
  if (q.includes('why') && q.includes('confidence')) {
    return [
      'Confidence is low or medium because:',
      '',
      '• Public GP/TLE data is not authoritative.',
      '• Covariance is unavailable in this prototype.',
      '• The propagation horizon may span several days, amplifying uncertainty.',
      '• The data age contributes additional uncertainty.',
      '',
      'Simulation only — not a flight command.',
    ].join('\n');
  }
  if (q.includes('investigate') || q.includes('first')) {
    return [
      'Investigate critical and high-risk events first.',
      '',
      'Start with the event that has the smallest miss distance AND the highest risk score — these are most likely to require follow-up.',
      '',
      'Simulation only — not a flight command.',
    ].join('\n');
  }
  if (q.includes('compare') && q.includes('maneuver')) {
    return [
      'Comparing maneuver scenarios:',
      '',
      '• Look at the scenario table: ΔV, miss distance, and resulting risk.',
      '• Prefer scenarios that clear the original conjunction without creating new sub-threshold events.',
      '• Earlier burns generally cost less ΔV for the same risk reduction (more orbital periods to drift away).',
      '',
      'Simulation only — not a flight command.',
    ].join('\n');
  }
  if (q.includes('summarize') || q.includes('today')) {
    return [
      'Today\'s mission summary:',
      '',
      facts,
      '',
      'Simulation only — not a flight command.',
    ].join('\n');
  }
  if (q.includes('execute') || q.includes('burn') || q.includes('should i')) {
    return [
      'I cannot authorize or issue flight commands.',
      '',
      'This system is a prototype decision-support tool. Operational decisions require authoritative orbital data and qualified flight-dynamics analysis.',
      '',
      'Simulation only — not a flight command.',
    ].join('\n');
  }
  return [
    'I can only explain deterministic backend facts. Here is the fact sheet for this event:',
    '',
    facts,
    '',
    'Ask me: "Why is this event risky?", "Why is confidence low?", "What does TCA mean?", "Which conjunction should I investigate first?", or "Compare these maneuver scenarios."',
    '',
    'Simulation only — not a flight command.',
  ].join('\n');
}
