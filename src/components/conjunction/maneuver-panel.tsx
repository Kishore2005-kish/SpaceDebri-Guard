'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Activity, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Scenario {
  label: string;
  hoursBeforeTca: number;
  deltaV: number;
  direction: string | null;
  missDistanceKm: number;
  relVelocityKmPerS: number;
  riskScore: number;
  riskLevel: string;
  newTca?: string;
  semiMajorAxisChangeKm: number;
  newConjunctions: { secondaryId: string; secondaryName: string; minRangeKm: number; tca: string }[];
  originalResolved: boolean;
  notes: string[];
}

interface SimOutput {
  baseline: Scenario;
  scenarios: Scenario[];
  bestScenario: Scenario;
  recommendation: string;
  disclaimer: string;
  secondaryConjunctionCheckSummary: string;
}

export function ManeuverSimulatorPanel({ conjunctionId }: { conjunctionId: string }) {
  const [sim, setSim] = useState<SimOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [customDeltaV, setCustomDeltaV] = useState(50); // mm/s
  const [customDirection, setCustomDirection] = useState<'RADIAL' | 'ALONG_TRACK' | 'CROSS_TRACK'>('ALONG_TRACK');
  const [customHours, setCustomHours] = useState(48);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Run a default sweep
      const r = await fetch(`/api/conjunctions/${conjunctionId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      setSim(j.simulation);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [conjunctionId]);

  const runCustom = async () => {
    setRunning(true);
    try {
      const r = await fetch(`/api/conjunctions/${conjunctionId}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarios: [{
            hoursBeforeTca: customHours,
            deltaV: customDeltaV / 1000, // mm/s -> m/s
            direction: customDirection,
          }],
        }),
      });
      const j = await r.json();
      // Merge: just append to existing scenarios? Replace with default + custom for now
      if (sim) {
        const custom = j.simulation.scenarios[0];
        custom.label = 'CUSTOM';
        const merged = [...sim.scenarios.filter(s => s.label !== 'CUSTOM'), custom];
        setSim({ ...sim, scenarios: merged });
      } else {
        setSim(j.simulation);
      }
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-xs font-mono text-muted-foreground">Running maneuver what-if sweep…</div>;
  }
  if (!sim) return null;

  function levelColor(level: string) {
    switch (level) {
      case 'CRITICAL': return 'text-red-500';
      case 'HIGH': return 'text-amber-500';
      case 'MODERATE': return 'text-yellow-500';
      case 'LOW': return 'text-emerald-500';
      default: return 'text-muted-foreground';
    }
  }

  return (
    <div className="p-3 space-y-3">
      {/* Disclaimer */}
      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2 flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Simulation only — not a flight command. Operational decisions require authoritative orbital data and qualified flight-dynamics analysis.
        </p>
      </div>

      {/* Scenario table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="bg-muted/30">
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="text-left px-2 py-1.5 font-normal">Scenario</th>
              <th className="text-right px-2 py-1.5 font-normal">ΔV (m/s)</th>
              <th className="text-right px-2 py-1.5 font-normal hidden md:table-cell">Direction</th>
              <th className="text-right px-2 py-1.5 font-normal">Miss Dist</th>
              <th className="text-right px-2 py-1.5 font-normal">Risk</th>
              <th className="text-right px-2 py-1.5 font-normal hidden md:table-cell">Sec Conj</th>
            </tr>
          </thead>
          <tbody>
            {[sim.baseline, ...sim.scenarios.filter(s => s.label !== 'Baseline')].map((s) => {
              const isBest = s.label === sim.bestScenario.label;
              const minLabel = s.missDistanceKm < 1 ? `${(s.missDistanceKm * 1000).toFixed(0)} m` : `${s.missDistanceKm.toFixed(3)} km`;
              return (
                <tr key={s.label} className={cn('border-t border-border', isBest && 'bg-primary/10')}>
                  <td className="px-2 py-1.5 font-bold">
                    {isBest && <span className="text-primary mr-1">★</span>}
                    {s.label}
                  </td>
                  <td className="px-2 py-1.5 text-right tnum">{s.deltaV.toFixed(3)}</td>
                  <td className="px-2 py-1.5 text-right text-[10px] hidden md:table-cell">{s.direction ?? '—'}</td>
                  <td className="px-2 py-1.5 text-right tnum">{minLabel}</td>
                  <td className={cn('px-2 py-1.5 text-right font-bold tnum', levelColor(s.riskLevel))}>{s.riskScore}</td>
                  <td className="px-2 py-1.5 text-right hidden md:table-cell">
                    {s.newConjunctions.length === 0 ? (
                      <span className="text-emerald-500">None</span>
                    ) : (
                      <span className="text-amber-500">{s.newConjunctions.length} ⚠</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Recommendation */}
      <Card className="p-3 border-primary/40 bg-primary/5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" /> BEST SIMULATED OPTION
        </div>
        <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap leading-relaxed">{sim.recommendation}</pre>
      </Card>

      {/* Secondary conjunction check */}
      <Card className="p-3 border-border">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> SECONDARY CONJUNCTION CHECK (RE-SCREEN AFTER MANEUVER)
        </div>
        <p className="text-[11px] font-mono text-muted-foreground mb-2">{sim.secondaryConjunctionCheckSummary}</p>
        {sim.bestScenario.newConjunctions.length > 0 ? (
          <div className="space-y-1 font-mono text-[11px]">
            {sim.bestScenario.newConjunctions.map((c, i) => (
              <div key={i} className="flex justify-between bg-amber-500/5 border border-amber-500/30 rounded px-2 py-1">
                <span>{c.secondaryName}</span>
                <span className="tnum">{c.minRangeKm.toFixed(3)} km · {new Date(c.tca).toISOString().slice(11, 16)}Z</span>
              </div>
            ))}
            <div className="rounded bg-red-500/5 border border-red-500/30 px-2 py-1.5 mt-2">
              <div className="text-[10px] text-red-500 mb-0.5">NET RESULT</div>
              <div className="text-[11px]">Review required — maneuver creates additional conjunction(s).</div>
            </div>
          </div>
        ) : (
          <div className="rounded bg-emerald-500/5 border border-emerald-500/30 px-2 py-1.5">
            <div className="text-[10px] text-emerald-500 mb-0.5">NET RESULT</div>
            <div className="text-[11px]">No unacceptable secondary conjunctions detected.</div>
          </div>
        )}
      </Card>

      {/* Custom scenario */}
      <Card className="p-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">CUSTOM WHAT-IF</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1">BURN TIME (h before TCA)</label>
            <Select value={customHours.toString()} onValueChange={(v) => setCustomHours(parseInt(v, 10))}>
              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[72, 48, 36, 24, 12, 6].map(h => <SelectItem key={h} value={h.toString()}>{h}h</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] font-mono text-muted-foreground block mb-1">DIRECTION</label>
            <Select value={customDirection} onValueChange={(v: any) => setCustomDirection(v)}>
              <SelectTrigger className="h-8 text-xs font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RADIAL">Radial</SelectItem>
                <SelectItem value="ALONG_TRACK">Along-track</SelectItem>
                <SelectItem value="CROSS_TRACK">Cross-track</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mb-3">
          <label className="text-[10px] font-mono text-muted-foreground flex justify-between mb-1">
            <span>ΔV</span><span className="tnum text-primary">{(customDeltaV / 1000).toFixed(3)} m/s ({customDeltaV} mm/s)</span>
          </label>
          <Slider value={[customDeltaV]} onValueChange={(v) => setCustomDeltaV(v[0])} min={5} max={200} step={5} />
        </div>
        <Button size="sm" onClick={runCustom} disabled={running} className="gap-1.5 font-mono text-[11px] w-full">
          {running ? 'SIMULATING…' : 'RUN CUSTOM SCENARIO'} {!running && <ArrowRight className="h-3 w-3" />}
        </Button>
      </Card>

      <div className="text-[10px] font-mono text-muted-foreground">
        <Badge variant="outline" className="text-[9px] mr-2">DISCLAIMER</Badge>
        {sim.disclaimer}
      </div>
    </div>
  );
}
