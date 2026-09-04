'use client';
import { useEffect, useState } from 'react';
import { useUI } from '@/lib/store';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertTriangle, Activity, Clock, Database, Shield, Satellite as SatelliteIcon, TrendingUp, Globe, Zap, CheckCircle2, ExternalLink } from 'lucide-react';
import { ConjunctionDTO } from '@/lib/services';
import { ConjunctionsTable } from '@/components/conjunction/conjunctions-table';
import { AnalysisPanel } from '@/components/simulation/analysis-panel';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface Summary {
  protectedSatellites: number;
  totalObjects: number;
  upcomingConjunctions: number;
  criticalCount: number;
  highCount: number;
  moderateCount: number;
  lowCount: number;
  nextCritical?: ConjunctionDTO;
  highestRisk?: ConjunctionDTO;
  dataFreshnessHours: number;
  dataSource: string;
  analysisStatus: string;
  lastScreeningTime: string | null;
  lastRefreshAt: string | null;
  snapshotId: string | null;
  propagator: string;
  propagatorFrame: string;
}

interface StatusInfo {
  status: string;
  source: string;
  lastRefreshAt: string | null;
  snapshotId: string | null;
  totalObjects: number;
  liveObjects: number;
  demoObjects: number;
  dataAgeHours: number;
  propagator: string;
  riskModelVersion: string;
}

interface EvaluatorData {
  proveIt: { label: string; status: string; detail: string; link: string }[];
  systemState: { status: string; liveObjects: number; demoObjects: number; totalObjects: number; conjunctionEvents: number; latestObjectName: string | null; latestObjectCatalogId: string | null; latestEpoch: string | null; dataAgeHours: number };
  configuration: { propagator: string; riskModelVersion: string; defaultScreeningHorizonDays: number; defaultScreeningThresholdKm: number };
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'critical' | 'high' | 'moderate' | 'low' | 'neutral' }) {
  const colorMap = {
    critical: 'text-red-500',
    high: 'text-amber-500',
    moderate: 'text-yellow-500',
    low: 'text-emerald-500',
    neutral: 'text-primary',
  };
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 border-l border-border first:border-l-0">
      <div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('text-2xl font-mono font-bold leading-none tnum', tone ? colorMap[tone] : '')}>{value}</div>
      {sub && <div className="text-[9px] font-mono text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function DashboardView() {
  const { openConjunction, startDemo, demoActive, demoStep } = useUI();
  const { toast } = useToast();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [evaluator, setEvaluator] = useState<EvaluatorData | null>(null);
  const [conjunctions, setConjunctions] = useState<ConjunctionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProveIt, setShowProveIt] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [dashboard, conj, statusResp, evalResp] = await Promise.all([
        fetch('/api/dashboard').then(r => r.json()),
        fetch('/api/conjunctions').then(r => r.json()),
        fetch('/api/status').then(r => r.json()),
        fetch('/api/evaluator').then(r => r.json()),
      ]);
      setSummary(dashboard);
      setConjunctions(conj.conjunctions);
      setStatus(statusResp);
      setEvaluator(evalResp);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      // 1) Fetch real CelesTrak data
      const r = await fetch('/api/orbits/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: ['stations'] }),
      });
      const j = await r.json();
      toast({
        title: 'Real orbital data refreshed',
        description: `${j.objectsImported} imported / ${j.objectsUpdated} updated from CelesTrak (snapshot ${j.snapshotId})`,
      });
      // 2) Re-screen with the new data
      await fetch('/api/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      await load();
    } catch (e: any) {
      toast({ title: 'Refresh failed', description: e.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  const statusColor =
    status?.status === 'LIVE' ? 'text-emerald-500' :
    status?.status === 'CACHED' ? 'text-amber-500' :
    status?.status === 'STALE' ? 'text-orange-500' :
    status?.status === 'DEMO' ? 'text-yellow-500' :
    'text-red-500';

  return (
    <div className="p-4 space-y-4">
      {/* Mission summary */}
      <Card className="console-grid p-4">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">MY MISSION</div>
            <h1 className="text-2xl font-mono font-bold mt-0.5">Small-Sat Operator Fleet</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              First-layer conjunction awareness for small satellite operators.
              {' '}
              <span className={cn('font-bold', statusColor)}>
                {status?.status === 'LIVE' ? '● REAL CELESTRAK DATA' :
                 status?.status === 'CACHED' ? '● CACHED REAL DATA' :
                 status?.status === 'DEMO' ? '● DEMO MODE (synthetic)' :
                 '● ' + (status?.status ?? 'UNKNOWN')}
              </span>
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="default" onClick={refresh} disabled={refreshing} className="gap-1.5 font-mono text-[11px]">
              <Globe className="h-3 w-3" />
              {refreshing ? 'FETCHING…' : 'FETCH REAL CELESTRAK DATA'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              fetch('/api/screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).then(() => load());
            }} className="gap-1.5 font-mono text-[11px]">
              <RefreshCw className="h-3 w-3" /> RE-SCREEN
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap divide-x-0 -mx-4 -my-2.5 border-y border-border">
          <Stat label="Protected Sats" value={summary?.protectedSatellites?.toString() ?? '—'} sub="fleet" />
          <Stat label="Catalog" value={summary?.totalObjects?.toString() ?? '—'} sub={`${status?.liveObjects ?? 0} live / ${status?.demoObjects ?? 0} demo`} />
          <Stat label="Upcoming" value={summary?.upcomingConjunctions?.toString() ?? '—'} sub="events (7d)" />
          <Stat label="Critical" value={summary?.criticalCount?.toString() ?? '—'} tone="critical" sub="≥75 risk" />
          <Stat label="High" value={summary?.highCount?.toString() ?? '—'} tone="high" sub="50-74" />
          <Stat label="Moderate" value={summary?.moderateCount?.toString() ?? '—'} tone="moderate" sub="25-49" />
          <Stat label="Low" value={summary?.lowCount?.toString() ?? '—'} tone="low" sub="0-24" />
        </div>
      </Card>

      {/* Data source panel */}
      {status && (
        <Card className={cn(
          'p-3 border',
          status.status === 'LIVE' ? 'border-emerald-500/40 bg-emerald-500/5' :
          status.status === 'DEMO' ? 'border-yellow-500/40 bg-yellow-500/5' :
          'border-amber-500/40 bg-amber-500/5'
        )}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <Database className={cn('h-4 w-4', statusColor)} />
              <div>
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">ORBIT DATA</div>
                <div className={cn('text-sm font-mono font-bold', statusColor)}>
                  {status.status === 'LIVE' ? '● LIVE — real CelesTrak data' :
                   status.status === 'CACHED' ? '● CACHED — last validated snapshot' :
                   status.status === 'STALE' ? '● STALE — refresh recommended' :
                   status.status === 'DEMO' ? '● DEMO — synthetic dataset' :
                   '● OFFLINE'}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                  Source: {status.source} ·
                  {' '}Retrieved: {status.lastRefreshAt ? new Date(status.lastRefreshAt).toISOString().slice(0, 19) + 'Z' : '—'} ·
                  {' '}Snapshot: {status.snapshotId ?? '—'} ·
                  {' '}Propagator: SGP4 ·
                  {' '}Frame: TEME
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowProveIt(s => !s)} className="gap-1.5 font-mono text-[10px]">
                <Shield className="h-3 w-3" /> HOW DO WE KNOW THIS IS REAL?
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* "Prove It" panel */}
      {showProveIt && evaluator && (
        <Card className="p-3 border-primary/40 bg-primary/5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> HOW DO WE KNOW THIS IS REAL?
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {evaluator.proveIt.map((item, i) => (
              <div key={i} className="flex items-start gap-2 p-2 rounded border border-border bg-card/50">
                <CheckCircle2 className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', item.status === 'verified' ? 'text-emerald-500' : 'text-muted-foreground')} />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] font-bold">{item.label}</div>
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{item.detail}</div>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-primary hover:underline mt-0.5 inline-flex items-center gap-0.5">
                      <ExternalLink className="h-2.5 w-2.5" /> source
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-2 pt-2 border-t border-border">
            <b>System state:</b> {evaluator.systemState.status} ·
            {' '}{evaluator.systemState.liveObjects} live + {evaluator.systemState.demoObjects} demo = {evaluator.systemState.totalObjects} total ·
            {' '}{evaluator.systemState.conjunctionEvents} conjunction events ·
            {' '}data age {evaluator.systemState.dataAgeHours.toFixed(1)}h
            {evaluator.systemState.latestObjectName && (
              <> · latest object: <b>{evaluator.systemState.latestObjectName}</b> (NORAD {evaluator.systemState.latestObjectCatalogId}, epoch {evaluator.systemState.latestEpoch?.slice(0, 19)}Z)</>
            )}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground mt-1">
            <b>Configuration:</b> {evaluator.configuration.propagator} ·
            {' '}{evaluator.configuration.riskModelVersion} ·
            {' '}screening {evaluator.configuration.defaultScreeningHorizonDays}d / {evaluator.configuration.defaultScreeningThresholdKm}km
          </div>
        </Card>
      )}

      {/* Analysis configuration + progress */}
      <AnalysisPanel onAnalysisComplete={load} />

      {/* Next critical event banner */}
      {summary?.nextCritical && (
        <Card className="p-4 border-red-500/40 bg-red-500/5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 pulse-critical" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-red-500">NEXT CRITICAL EVENT</span>
                  <Badge variant="outline" className="text-red-500 border-red-500/40 font-mono">CRITICAL</Badge>
                  {summary.nextCritical.dataSource === 'CelesTrak' && (
                    <Badge variant="outline" className="text-emerald-500 border-emerald-500/40 font-mono text-[9px]">REAL CELESTRAK DATA</Badge>
                  )}
                  {summary.nextCritical.dataSource === 'SENTINEL-DEMO' && (
                    <Badge variant="outline" className="text-yellow-500 border-yellow-500/40 font-mono text-[9px]">SYNTHETIC DEMO</Badge>
                  )}
                </div>
                <div className="font-mono text-sm mt-1">
                  TCA: <span className="font-bold tnum">{new Date(summary.nextCritical.tca).toUTCString().replace(' GMT', ' UTC')}</span>
                </div>
                <div className="font-mono text-xs text-muted-foreground mt-1">
                  {summary.nextCritical.primaryName} ↔ {summary.nextCritical.secondaryName} ({summary.nextCritical.secondaryObjectType})
                  {' · '}Primary epoch: {summary.nextCritical.primaryEpoch?.slice(0, 19)}Z
                </div>
                <div className="font-mono text-xs mt-2 flex gap-4 flex-wrap">
                  <span>Miss dist: <span className="text-foreground tnum">{summary.nextCritical.minRange < 1 ? (summary.nextCritical.minRange * 1000).toFixed(0) + ' m' : summary.nextCritical.minRange.toFixed(2) + ' km'}</span></span>
                  <span>Rel vel: <span className="text-foreground tnum">{summary.nextCritical.relVelocity.toFixed(2)} km/s</span></span>
                  <span>Risk: <span className="text-red-500 font-bold tnum">{summary.nextCritical.riskScore}/100</span></span>
                  <span>Conf: <span className="text-amber-500 font-bold tnum">{summary.nextCritical.confidenceScore}/100</span></span>
                </div>
                <div className="font-mono text-[10px] text-muted-foreground mt-2">
                  Propagator: {summary.nextCritical.propagator} · Snapshot: {summary.nextCritical.snapshotId ?? '—'}
                </div>
              </div>
            </div>
            <Button size="sm" variant="destructive" onClick={() => openConjunction(summary.nextCritical!.id)} className="gap-1.5 font-mono text-[11px]">
              <Activity className="h-3 w-3" /> OPEN EVENT
            </Button>
          </div>
        </Card>
      )}

      {/* Quick info strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 lift-hover">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
            <Clock className="h-3 w-3" /> DATA AGE
          </div>
          <div className="text-xl font-mono font-bold mt-1 tnum">{summary ? Math.abs(summary.dataFreshnessHours).toFixed(1) : '—'}<span className="text-xs font-normal text-muted-foreground ml-1">h</span></div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Since last orbit epoch</div>
        </Card>
        <Card className="p-3 lift-hover">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
            <Database className="h-3 w-3" /> SOURCE
          </div>
          <div className="text-base font-mono font-bold mt-1">{status?.source ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">CelesTrak GP/OMM</div>
        </Card>
        <Card className="p-3 lift-hover">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
            <Shield className="h-3 w-3" /> STATUS
          </div>
          <div className={cn('text-base font-mono font-bold mt-1', statusColor)}>{summary?.analysisStatus ?? '—'}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">Screening pipeline</div>
        </Card>
        <Card className="p-3 lift-hover">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-muted-foreground">
            <TrendingUp className="h-3 w-3" /> HIGHEST RISK
          </div>
          {summary?.highestRisk ? (
            <>
              <div className="text-base font-mono font-bold mt-1 tnum">{summary.highestRisk.riskScore}/100</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{summary.highestRisk.primaryName} ↔ {summary.highestRisk.secondaryName}</div>
            </>
          ) : <div className="text-base font-mono mt-1 text-muted-foreground">—</div>}
        </Card>
      </div>

      {/* Demo mode hint */}
      {demoActive && (
        <Card className="p-3 border-primary/50 bg-primary/5 flex items-center gap-3">
          <SatelliteIcon className="h-4 w-4 text-primary" />
          <div className="flex-1 text-xs font-mono">DEMO MODE — Step {demoStep}/14 · Automated showcase running…</div>
          <Button size="sm" variant="ghost" onClick={() => useUI.getState().endDemo()} className="text-[11px] font-mono">EXIT DEMO</Button>
        </Card>
      )}

      {/* Top conjunctions preview */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-2 border-b border-border flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">TOP RISK CONJUNCTIONS</div>
          <Button size="sm" variant="ghost" onClick={() => useUI.getState().setView('conjunctions')} className="text-[11px] font-mono">VIEW ALL →</Button>
        </div>
        <ConjunctionsTable conjunctions={conjunctions.slice(0, 8)} loading={loading} compact />
      </Card>
    </div>
  );
}
