'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUI } from '@/lib/store';
import { Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Conjunction {
  id: string;
  primaryName: string;
  secondaryName: string;
  secondaryObjectType: string;
  tca: string;
  minRange: number;
  relVelocity: number;
  riskScore: number;
  riskLevel: string;
  confidenceScore: number;
  dataSource: string;
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

function levelBg(level: string) {
  switch (level) {
    case 'CRITICAL': return 'border-red-500/30 bg-red-500/5';
    case 'HIGH': return 'border-amber-500/30 bg-amber-500/5';
    case 'MODERATE': return 'border-yellow-500/30 bg-yellow-500/5';
    case 'LOW': return 'border-emerald-500/30 bg-emerald-500/5';
    default: return 'border-border';
  }
}

export function SimulationListView() {
  const { openSimulation } = useUI();
  const [conjunctions, setConjunctions] = useState<Conjunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/conjunctions');
        if (!response.ok) {
          throw new Error(`Failed to load close approaches (${response.status})`);
        }

        const data = await response.json();
        if (!cancelled) {
          setConjunctions(Array.isArray(data.conjunctions) ? data.conjunctions : []);
        }
      } catch (err) {
        if (!cancelled) {
          setConjunctions([]);
          setError(err instanceof Error ? err.message : 'Failed to load close approaches.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm font-mono text-muted-foreground">Loading close approaches…</div>;
  }

  if (conjunctions.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-mono font-bold mb-2">Close Approaches</h1>
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground font-mono">
            {error ?? 'No close approaches detected.'}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {error ? 'Check the API/server logs for the underlying failure, then refresh this page.' : 'Run an analysis from the Analyze tab to find conjunctions.'}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-mono font-bold mb-4">Close Approaches</h1>
      <p className="text-xs text-muted-foreground mb-6">Click an event to open the orbital simulation.</p>
      <div className="space-y-2">
        {conjunctions.map((c) => (
          <Card
            key={c.id}
            className={cn('p-4 cursor-pointer transition-colors hover:border-primary/40', levelBg(c.riskLevel))}
            onClick={() => openSimulation(c.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className={cn('w-2 h-2 rounded-full shrink-0',
                  c.riskLevel === 'CRITICAL' ? 'bg-red-500' :
                  c.riskLevel === 'HIGH' ? 'bg-amber-500' :
                  c.riskLevel === 'MODERATE' ? 'bg-yellow-500' : 'bg-emerald-500'
                )} />
                <div className="min-w-0">
                  <div className="font-mono text-sm font-bold truncate">
                    {c.primaryName} ↔ {c.secondaryName}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    TCA: {new Date(c.tca).toUTCString().replace(' GMT', ' UTC')} ·
                    {' '}{c.minRange < 1 ? `${(c.minRange * 1000).toFixed(0)} m` : `${c.minRange.toFixed(2)} km`} ·
                    {' '}{c.relVelocity.toFixed(2)} km/s
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className={cn('font-mono text-lg font-bold tnum', levelColor(c.riskLevel))}>
                    {c.riskScore}
                  </div>
                  <div className={cn('font-mono text-[9px]', levelColor(c.riskLevel))}>
                    {c.riskLevel}
                  </div>
                </div>
                {c.dataSource === 'CelesTrak' ? (
                  <span className="text-[8px] font-mono text-emerald-500">LIVE</span>
                ) : (
                  <span className="text-[8px] font-mono text-yellow-500">DEMO</span>
                )}
                <Activity className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
