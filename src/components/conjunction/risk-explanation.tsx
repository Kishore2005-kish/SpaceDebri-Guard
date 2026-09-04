'use client';
import { ConjunctionDTO } from '@/lib/services';
import { Badge } from '@/components/ui/badge';

function bar(score: number, max = 10) {
  const filled = Math.round(score * max);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, max - filled));
}

function levelColor(level: string) {
  switch (level) {
    case 'CRITICAL': return 'text-red-500';
    case 'HIGH': return 'text-amber-500';
    case 'MODERATE': return 'text-yellow-500';
    case 'LOW': return 'text-emerald-500';
    default: return 'text-muted-foreground';
  }
}

export function RiskExplanation({ conjunction }: { conjunction: ConjunctionDTO }) {
  const sorted = [...conjunction.riskFactors].sort((a, b) => b.contribution - a.contribution);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-mono font-bold ${levelColor(conjunction.riskLevel)}`}>
            {conjunction.riskLevel} RISK — {conjunction.riskScore}/100
          </span>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground mt-1 leading-relaxed">{conjunction.explanation}</div>
      </div>

      <div className="rounded border border-border bg-card/50 p-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">MAIN CONTRIBUTORS</div>
        <div className="space-y-1.5 font-mono text-[11px]">
          {sorted.map((f) => (
            <div key={f.key} className="grid grid-cols-[100px_140px_1fr] items-center gap-2">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="text-emerald-500 tracking-tight whitespace-pre">{bar(f.score)}</span>
              <span className="text-muted-foreground text-[10px]">{f.display} · {(f.contribution).toFixed(1)}/100</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border border-border p-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">CONFIDENCE</div>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-lg font-mono font-bold ${conjunction.confidenceLevel === 'HIGH' ? 'text-emerald-500' : conjunction.confidenceLevel === 'MEDIUM' ? 'text-amber-500' : 'text-red-500'}`}>
            {conjunction.confidenceScore}/100 — {conjunction.confidenceLevel}
          </span>
        </div>
        <div className="text-[11px] font-mono text-muted-foreground mb-2">WHY?</div>
        <ul className="space-y-1 text-[11px] font-mono">
          {conjunction.confidenceContributors.map((c, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-amber-500 mt-0.5">•</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
        <div className="text-[10px] font-mono text-amber-500 mb-1">⚠ PROTOTYPE HEURISTIC</div>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {conjunction.disclaimer}
        </p>
      </div>

      <div className="rounded border border-border p-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">RISK MODEL</div>
        <div className="font-mono text-[11px] space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Model version</span><span>v0.3-prototype</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Weights</span><span>Distance 40 · Velocity 15 · Geometry 15 · Uncertainty 20 · Freshness 10</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Screening</span><span>{conjunction.screeningThreshold} km / 7 days</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Propagation</span><span>Keplerian + J2 (prototype)</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Horizon</span><span>{conjunction.propagationHorizonHours.toFixed(1)} h</span></div>
        </div>
      </div>
    </div>
  );
}
