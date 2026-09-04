'use client';
import { useEffect, useState } from 'react';
import { useUI } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Globe, Zap, Activity, AlertTriangle, Radio, Clock, Database } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Summary {
  protectedSatellites: number;
  totalObjects: number;
  upcomingConjunctions: number;
  criticalCount: number;
  highCount: number;
  moderateCount: number;
  lowCount: number;
  nextCritical?: any;
  highestRisk?: any;
  dataFreshnessHours: number;
  dataSource: string;
  analysisStatus: string;
  lastScreeningTime: string | null;
  lastRefreshAt: string | null;
  snapshotId: string | null;
}

interface StatusInfo {
  status: string;
  source: string;
  lastRefreshAt: string | null;
  totalObjects: number;
  liveObjects: number;
  demoObjects: number;
  dataAgeHours: number;
}

export function OverviewView() {
  const { setView, openSimulation } = useUI();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);

  const load = async () => {
    try {
      const [dash, stat] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/status').then(r => r.json()),
      ]);
      setSummary(dash);
      setStatus(stat);
    } catch {}
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [dash, stat] = await Promise.all([
          fetch('/api/dashboard').then(r => r.json()),
          fetch('/api/status').then(r => r.json()),
        ]);
        if (!cancelled) { setSummary(dash); setStatus(stat); }
      } catch {}
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const statusColor =
    status?.status === 'LIVE' ? 'text-emerald-500' :
    status?.status === 'DEMO' ? 'text-yellow-500' : 'text-amber-500';

  const next = summary?.nextCritical || summary?.highestRisk;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Hero */}
      <div className="text-center mb-8">
        <Globe className="h-12 w-12 text-primary mx-auto mb-3" />
        <h1 className="text-3xl font-mono font-bold mb-2">SENTINEL</h1>
        <p className="text-sm text-muted-foreground mb-6">Conjunction Awareness for Small Satellites</p>
        <Button size="lg" onClick={() => setView('analyze')} className="gap-2 font-mono text-sm px-8 py-6">
          <Zap className="h-4 w-4" /> ANALYZE SATELLITE
        </Button>
      </div>

      {/* Data status */}
      {status && (
        <div className="flex items-center justify-center gap-6 mb-8 text-[11px] font-mono">
          <div className="flex items-center gap-1.5">
            <Database className={cn('h-3 w-3', statusColor)} />
            <span className={statusColor}>{status.status}</span>
          </div>
          <span className="text-muted-foreground">Source: {status.source}</span>
          <span className="text-muted-foreground">Objects: {status.totalObjects}</span>
          <span className="text-muted-foreground">
            Updated: {status.lastRefreshAt ? new Date(status.lastRefreshAt).toISOString().slice(11, 19) + 'Z' : '—'}
          </span>
        </div>
      )}

      {/* Upcoming close approaches summary */}
      {summary && summary.upcomingConjunctions > 0 && (
        <div className="flex items-center justify-center gap-6 mb-6">
          <div className={cn('text-center', summary.criticalCount > 0 ? 'text-red-500' : 'text-muted-foreground')}>
            <div className="text-2xl font-mono font-bold tnum">{summary.criticalCount}</div>
            <div className="text-[9px] font-mono uppercase">Critical</div>
          </div>
          <div className={cn('text-center', summary.highCount > 0 ? 'text-amber-500' : 'text-muted-foreground')}>
            <div className="text-2xl font-mono font-bold tnum">{summary.highCount}</div>
            <div className="text-[9px] font-mono uppercase">High</div>
          </div>
          <div className={cn('text-center', summary.moderateCount > 0 ? 'text-yellow-500' : 'text-muted-foreground')}>
            <div className="text-2xl font-mono font-bold tnum">{summary.moderateCount}</div>
            <div className="text-[9px] font-mono uppercase">Moderate</div>
          </div>
          <div className={cn('text-center', summary.lowCount > 0 ? 'text-emerald-500' : 'text-muted-foreground')}>
            <div className="text-2xl font-mono font-bold tnum">{summary.lowCount}</div>
            <div className="text-[9px] font-mono uppercase">Low</div>
          </div>
        </div>
      )}

      {/* Next close approach */}
      {next && (
        <Card className="p-5 border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-red-500">NEXT CLOSE APPROACH</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-[11px] font-mono">
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Primary</div>
              <div className="font-bold text-emerald-500">{next.primaryName}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Secondary</div>
              <div className="font-bold text-amber-500">{next.secondaryName}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">TCA</div>
              <div className="font-bold tnum">{new Date(next.tca).toUTCString().replace(' GMT', ' UTC')}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Minimum Separation</div>
              <div className="font-bold tnum">{next.minRange < 1 ? `${(next.minRange * 1000).toFixed(0)} m` : `${next.minRange.toFixed(3)} km`}</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Relative Velocity</div>
              <div className="font-bold tnum">{next.relVelocity.toFixed(2)} km/s</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground uppercase">Risk</div>
              <div className={cn('font-bold', next.riskLevel === 'CRITICAL' ? 'text-red-500' : next.riskLevel === 'HIGH' ? 'text-amber-500' : 'text-yellow-500')}>
                {next.riskLevel} ({next.riskScore}/100)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
            {next.dataSource === 'CelesTrak' ? (
              <span className="text-[9px] font-mono text-emerald-500">● LIVE CELESTRAK</span>
            ) : (
              <span className="text-[9px] font-mono text-yellow-500">● SYNTHETIC DEMO</span>
            )}
          </div>
          <Button
            size="lg"
            className="w-full mt-4 gap-2 font-mono text-sm"
            onClick={() => openSimulation(next.id)}
          >
            <Activity className="h-4 w-4" /> VIEW SIMULATION
          </Button>
        </Card>
      )}

      {/* No conjunctions message */}
      {summary && summary.upcomingConjunctions === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground font-mono">No close approaches detected yet.</p>
          <p className="text-xs text-muted-foreground font-mono mt-1">Run an analysis to screen for conjunctions.</p>
        </Card>
      )}
    </div>
  );
}
