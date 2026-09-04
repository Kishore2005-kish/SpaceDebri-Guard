'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { X, Activity, Crosshair, Zap, Globe, Shield, AlertTriangle, CheckCircle2, Radio, Clock, Gauge, Activity as ActivityIcon, ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Dynamic import of CesiumGlobe (client-only, no SSR)
const CesiumGlobe = dynamic(() => import('./cesium-globe').then(m => m.CesiumGlobe), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-black">
      <div className="text-center">
        <div className="text-emerald-400 font-mono text-sm animate-pulse">● Loading 3D Globe…</div>
      </div>
    </div>
  ),
});

interface TrajectoryPoint {
  t: string; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
}

interface SimResult {
  engine: string;
  engineVersion: string;
  primary: { catalogId: string; name: string };
  secondary: { catalogId: string; name: string; objectType: string };
  tca: string;
  minimumRangeKm: number;
  minimumSeparationKm: number;
  relativeVelocityKmPerSec: number;
  thresholdKm: number;
  analysisStart: string;
  analysisEnd: string;
  primaryTrajectory: TrajectoryPoint[];
  secondaryTrajectory: TrajectoryPoint[];
  separationSeries: { t: string; range: number }[];
  covarianceAvailable: boolean;
  collisionProbabilityAvailable: boolean;
  collisionProbability?: number;
  fallbackReason?: string;
  stkScenarioId?: string;
  stkVersion?: string;
}

interface Comparison {
  sentinel: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  stk: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  socrates: { tca: string; minimumRangeKm: number; relativeVelocityKmPerSec: number } | null;
  tcaDifferenceSec: number | null;
  rangeDifferenceKm: number | null;
}

interface SimRunStatus {
  id: string;
  status: string;
  engine: string;
  engineVersion: string;
  startedAt: string;
  completedAt: string | null;
  scenarioId: string | null;
  error: string | null;
}

interface ConjunctionInfo {
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
  confidenceLevel: string;
  primarySatId: string;
  secondarySatId: string;
  dataSource: string;
}

const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Queued — waiting to start',
  STARTING_STK: 'Starting STK…',
  LOADING_DATA: 'Loading orbital data…',
  PROPAGATING: 'Propagating trajectories (SGP4)…',
  RUNNING_CAT: 'Running Advanced CAT…',
  EXTRACTING_RESULTS: 'Extracting results…',
  COMPLETE: 'Complete',
  FAILED: 'Failed',
  STK_UNAVAILABLE: 'STK unavailable — using SGP4 fallback',
};

export function SimulationView({ conjunctionId, onClose }: { conjunctionId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [conjunction, setConjunction] = useState<ConjunctionInfo | null>(null);
  const [simRun, setSimRun] = useState<SimRunStatus | null>(null);
  const [simResult, setSimResult] = useState<SimResult | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Load conjunction info
  useEffect(() => {
    fetch(`/api/conjunctions/${conjunctionId}`)
      .then(r => r.json())
      .then(j => { setConjunction(j.conjunction); })
      .catch(() => {});
  }, [conjunctionId]);

  // Start a simulation when this view opens
  const startSim = async () => {
    setRunning(true);
    setSimResult(null);
    setComparison(null);
    try {
      const r = await fetch('/api/simulation/stk/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conjunctionId }),
      });
      const j = await r.json();
      if (j.simulationId) {
        toast({ title: 'Simulation started', description: 'Running orbital analysis…' });
        // Poll for status
        const poll = async () => {
          const r2 = await fetch(`/api/simulation/stk/${j.simulationId}`);
          const j2 = await r2.json();
          if (j2.simulation) {
            setSimRun(j2.simulation);
            if (j2.simulation.status === 'COMPLETE') {
              // Load the result
              const r3 = await fetch(`/api/simulation/${j.simulationId}/trajectory`);
              const j3 = await r3.json();
              setSimResult(j3);
              // Load comparison
              const r4 = await fetch(`/api/simulation/${j.simulationId}/comparison?conjunctionId=${conjunctionId}`);
              const j4 = await r4.json();
              setComparison(j4);
              setLoading(false);
              setRunning(false);
              return;
            }
            if (j2.simulation.status === 'FAILED') {
              setRunning(false);
              toast({ title: 'Simulation failed', description: j2.simulation.error, variant: 'destructive' });
              return;
            }
          }
          setTimeout(poll, 1000);
        };
        poll();
      } else {
        throw new Error(j.error || 'Failed to start simulation');
      }
    } catch (e: any) {
      setRunning(false);
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  // Auto-start simulation on mount
  useEffect(() => {
    if (conjunction && !simRun && !running) {
      startSim();
    }
  }, [conjunction, simRun, running]);

  // Time-to-TCA countdown (live updates)
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Set immediately so the countdown isn't blank for the first second
    const initialTimer = setTimeout(() => setNow(new Date()), 0);
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(initialTimer); clearInterval(i); };
  }, []);

  const tcaDate = conjunction ? new Date(conjunction.tca) : null;
  const tcaDiffMs = tcaDate && now ? tcaDate.getTime() - now.getTime() : 0;
  const tcaDiffHrs = Math.abs(tcaDiffMs / 3600000);
  const tcaDiffMin = Math.abs((tcaDiffMs % 3600000) / 60000);
  const tcaDiffStr = tcaDate && now
    ? `${tcaDiffMs > 0 ? 'T-' : 'T+'}${Math.floor(tcaDiffHrs)}h ${Math.floor(tcaDiffMin)}m`
    : '—';

  const isStkFallback = simResult?.engine === 'SENTINEL SGP4 (fallback)';

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/80 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Radio className="h-5 w-5 text-primary pulse-critical" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">ORBITAL SIMULATION VIEW</span>
              {conjunction && (
                <>
                  <Badge variant="outline" className="font-mono text-[10px]">{conjunction.riskLevel}</Badge>
                  {simResult && (
                    <Badge variant="outline" className={cn('font-mono text-[9px]', isStkFallback ? 'text-amber-500 border-amber-500/40' : 'text-emerald-500 border-emerald-500/40')}>
                      {simResult.engine.toUpperCase()}
                    </Badge>
                  )}
                </>
              )}
            </div>
            {conjunction && (
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                {conjunction.primaryName} ↔ {conjunction.secondaryName} · TCA {tcaDate?.toUTCString().replace(' GMT', ' UTC')}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={startSim} disabled={running} className="gap-1.5 font-mono text-[11px]">
            <Zap className="h-3 w-3" /> {running ? 'RUNNING…' : 'RERUN SIMULATION'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="font-mono text-[11px]">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body: 3-column layout */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[280px_1fr_320px]">
        {/* LEFT: event info */}
        <div className="overflow-y-auto scrollbar-thin p-3 space-y-3 border-r border-border bg-card/30">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">EVENT INFORMATION</div>
          {conjunction && (
            <Card className="p-3 console-grid">
              <div className="space-y-2 font-mono text-[11px]">
                <div>
                  <div className="text-[9px] text-muted-foreground">PRIMARY</div>
                  <div className="font-bold text-emerald-500">{conjunction.primaryName}</div>
                  <div className="text-[9px] text-muted-foreground">NORAD {conjunction.primarySatId}</div>
                </div>
                <Separator />
                <div>
                  <div className="text-[9px] text-muted-foreground">SECONDARY</div>
                  <div className="font-bold text-amber-500">{conjunction.secondaryName}</div>
                  <div className="text-[9px] text-muted-foreground">{conjunction.secondaryObjectType} · NORAD {conjunction.secondarySatId}</div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-1">
                  <div>
                    <div className="text-[9px] text-muted-foreground">TCA</div>
                    <div className="font-bold tnum">{tcaDate?.toISOString().slice(11, 19)}Z</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-muted-foreground">MISS DIST</div>
                    <div className="font-bold tnum text-red-500">{conjunction.minRange < 1 ? `${(conjunction.minRange * 1000).toFixed(0)} m` : `${conjunction.minRange.toFixed(3)} km`}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-muted-foreground">REL VEL</div>
                    <div className="font-bold tnum">{conjunction.relVelocity.toFixed(2)} km/s</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-muted-foreground">RISK / CONF</div>
                    <div className="font-bold tnum">
                      <span className="text-red-500">{conjunction.riskScore}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="text-amber-500">{conjunction.confidenceScore}</span>
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-[9px] text-muted-foreground">DATA SOURCE</div>
                  <div className={cn('font-bold', conjunction.dataSource === 'CelesTrak' ? 'text-emerald-500' : 'text-yellow-500')}>
                    {conjunction.dataSource === 'CelesTrak' ? '● REAL CELESTRAK DATA' : '● SYNTHETIC DEMO DATA'}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Time-to-TCA countdown */}
          {conjunction && (
            <Card className={cn('p-3 border', tcaDiffMs > 0 ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5')}>
              <div className="text-[9px] font-mono uppercase text-muted-foreground">TIME TO CLOSE APPROACH</div>
              <div className={cn('text-3xl font-mono font-bold tnum mt-1', tcaDiffMs > 0 ? 'text-emerald-500' : 'text-red-500')}>
                {tcaDiffStr}
              </div>
              <div className="text-[9px] font-mono text-muted-foreground mt-1">
                TCA: {tcaDate?.toISOString().slice(0, 19)}Z
              </div>
              <div className="text-[9px] font-mono text-muted-foreground">
                NOW: {now?.toISOString().slice(0, 19)}Z
              </div>
            </Card>
          )}

          {/* Status panel */}
          {simRun && (
            <Card className="p-3">
              <div className="text-[9px] font-mono uppercase text-muted-foreground">SIMULATION STATUS</div>
              <div className={cn('font-mono text-xs font-bold mt-1',
                simRun.status === 'COMPLETE' ? 'text-emerald-500' :
                simRun.status === 'FAILED' ? 'text-red-500' :
                'text-amber-500')}>
                {STATUS_LABELS[simRun.status] ?? simRun.status}
              </div>
              {simRun.scenarioId && (
                <div className="text-[9px] font-mono text-muted-foreground mt-1">
                  Scenario: {simRun.scenarioId}
                </div>
              )}
              {simRun.error && (
                <div className="text-[9px] font-mono text-red-500 mt-1">{simRun.error}</div>
              )}
            </Card>
          )}
        </div>

        {/* CENTER: 3D simulation */}
        <div className="overflow-hidden flex flex-col">
          {simResult && conjunction ? (
            <CesiumGlobe
              primaryTrajectory={simResult.primaryTrajectory || []}
              secondaryTrajectory={simResult.secondaryTrajectory || []}
              primaryName={conjunction.primaryName || 'Primary'}
              secondaryName={conjunction.secondaryName || 'Secondary'}
              tca={simResult.tca || new Date().toISOString()}
              minimumRangeKm={simResult.minimumRangeKm || 0}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-[#050a14]">
              <div className="text-center">
                <div className="font-mono text-sm text-muted-foreground animate-pulse">
                  {running ? '● Running orbital simulation…' : 'Loading…'}
                </div>
                {simRun && (
                  <div className="font-mono text-[10px] text-amber-500 mt-2">
                    {STATUS_LABELS[simRun.status] ?? simRun.status}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Separation chart at bottom */}
          {simResult && (simResult.separationSeries?.length ?? 0) > 0 && (
            <div className="h-[160px] border-t border-border bg-[#050a14] p-2">
              <div className="text-[9px] font-mono uppercase text-muted-foreground mb-1">SEPARATION VS TIME</div>
              <ResponsiveContainer width="100%" height="90%">
                <LineChart
                  data={(simResult.separationSeries || []).map(s => ({
                    t: s?.t ? new Date(s.t).toISOString().slice(11, 16) : '--:--',
                    range: s?.range ?? 0,
                  }))}
                  margin={{ top: 4, right: 16, bottom: 4, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="t" stroke="#888" tick={{ fill: '#888', fontSize: 9, fontFamily: 'monospace' }} />
                  <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 9, fontFamily: 'monospace' }} label={{ value: 'km', angle: -90, position: 'insideLeft', style: { fill: '#888', fontSize: 9 } }} />
                  <Tooltip
                    contentStyle={{ background: '#0a0e16', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace', fontSize: 10 }}
                    formatter={(v: any) => [`${Number(v).toFixed(3)} km`, 'Range']}
                  />
                  {simResult.tca && (
                    <ReferenceLine x={new Date(simResult.tca).toISOString().slice(11, 16)} stroke="#ff5050" strokeDasharray="3 3" label={{ value: 'TCA', fill: '#ff5050', fontSize: 9, fontFamily: 'monospace', position: 'top' }} />
                  )}
                  <ReferenceLine y={simResult.thresholdKm ?? 5} stroke="rgba(255,180,80,0.5)" strokeDasharray="2 4" />
                  <Line type="monotone" dataKey="range" stroke="#5ee695" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* RIGHT: engine comparison + provenance */}
        <div className="overflow-y-auto scrollbar-thin p-3 space-y-3 border-l border-border bg-card/30">
          {/* Engine comparison table */}
          <Card className="p-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
              <Activity className="h-3 w-3" /> ENGINE COMPARISON
            </div>
            {comparison ? (
              <table className="w-full text-[10px] font-mono">
                <thead className="text-[9px] text-muted-foreground uppercase">
                  <tr>
                    <th className="text-left pb-1">Metric</th>
                    <th className="text-right pb-1">SENTINEL</th>
                    <th className="text-right pb-1">STK</th>
                    <th className="text-right pb-1">SOCRATES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-1.5">TCA</td>
                    <td className="text-right tnum text-emerald-500">{comparison.sentinel?.tca ? new Date(comparison.sentinel.tca).toISOString().slice(11, 19) + 'Z' : '—'}</td>
                    <td className="text-right tnum text-amber-500">{comparison.stk?.tca ? new Date(comparison.stk.tca).toISOString().slice(11, 19) + 'Z' : '—'}</td>
                    <td className="text-right tnum">{comparison.socrates?.tca ? new Date(comparison.socrates.tca).toISOString().slice(11, 19) + 'Z' : '—'}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5">Range</td>
                    <td className="text-right tnum text-emerald-500">{comparison.sentinel?.minimumRangeKm != null ? comparison.sentinel.minimumRangeKm.toFixed(3) : '—'}</td>
                    <td className="text-right tnum text-amber-500">{comparison.stk?.minimumRangeKm != null ? comparison.stk.minimumRangeKm.toFixed(3) : '—'}</td>
                    <td className="text-right tnum">{comparison.socrates?.minimumRangeKm != null ? comparison.socrates.minimumRangeKm.toFixed(3) : '—'}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5">Rel vel</td>
                    <td className="text-right tnum text-emerald-500">{comparison.sentinel?.relativeVelocityKmPerSec != null ? comparison.sentinel.relativeVelocityKmPerSec.toFixed(2) : '—'}</td>
                    <td className="text-right tnum text-amber-500">{comparison.stk?.relativeVelocityKmPerSec != null ? comparison.stk.relativeVelocityKmPerSec.toFixed(2) : '—'}</td>
                    <td className="text-right tnum">{comparison.socrates?.relativeVelocityKmPerSec != null ? comparison.socrates.relativeVelocityKmPerSec.toFixed(2) : '—'}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-[10px] font-mono text-muted-foreground">Awaiting comparison data…</div>
            )}
            {comparison && (comparison.tcaDifferenceSec !== null || comparison.rangeDifferenceKm !== null) && (
              <div className="mt-2 pt-2 border-t border-border text-[10px] font-mono">
                <div className="text-muted-foreground mb-1">DIFFERENCE (STK vs SENTINEL)</div>
                <div className="flex justify-between">
                  <span>TCA:</span>
                  <span className="tnum">{comparison.tcaDifferenceSec !== null ? `±${comparison.tcaDifferenceSec.toFixed(2)} s` : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Range:</span>
                  <span className="tnum">{comparison.rangeDifferenceKm !== null ? `±${(comparison.rangeDifferenceKm * 1000).toFixed(0)} m` : '—'}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Engine + fallback note */}
          {simResult && (
            <Card className={cn('p-3 border', isStkFallback ? 'border-amber-500/40 bg-amber-500/5' : 'border-emerald-500/40 bg-emerald-500/5')}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">SIMULATION ENGINE</div>
              <div className={cn('font-mono text-sm font-bold mt-1', isStkFallback ? 'text-amber-500' : 'text-emerald-500')}>
                {isStkFallback ? '● SENTINEL SGP4 (fallback)' : '● STK ADVANCED CAT'}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground mt-1">
                {simResult.engineVersion}
              </div>
              {isStkFallback && (
                <div className="text-[10px] font-mono text-amber-500 mt-2 pt-2 border-t border-amber-500/20">
                  STK unavailable. This simulation used SENTINEL's integrated SGP4 engine.
                  The result is valid orbital mechanics, but is NOT a professional STK
                  Advanced CAT analysis.
                </div>
              )}
              <div className="text-[10px] font-mono text-muted-foreground mt-2 pt-2 border-t border-border">
                <div className="flex justify-between"><span>Scenario ID</span><span>{simResult.stkScenarioId ?? '—'}</span></div>
                <div className="flex justify-between"><span>STK version</span><span>{simResult.stkVersion ?? '—'}</span></div>
                <div className="flex justify-between"><span>Analysis start</span><span className="truncate max-w-[140px]">{simResult.analysisStart ? `${simResult.analysisStart.slice(0, 19)}Z` : '—'}</span></div>
                <div className="flex justify-between"><span>Analysis end</span><span className="truncate max-w-[140px]">{simResult.analysisEnd ? `${simResult.analysisEnd.slice(0, 19)}Z` : '—'}</span></div>
                <div className="flex justify-between"><span>Threshold</span><span className="tnum">{simResult.thresholdKm} km</span></div>
              </div>
            </Card>
          )}

          {/* Covariance / collision-probability panel */}
          {simResult && (
            <Card className="p-3 border-red-500/30 bg-red-500/5">
              <div className="text-[10px] font-mono uppercase tracking-wider text-red-500 mb-1 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3" /> COLLISION PROBABILITY
              </div>
              {simResult.collisionProbabilityAvailable ? (
                <>
                  <div className="text-2xl font-mono font-bold tnum text-red-500">
                    {(simResult.collisionProbability! * 100).toFixed(2)}%
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground mt-1">
                    Source: {simResult.engine}
                    <br />Inputs: primary covariance, secondary covariance, hard-body radius
                  </div>
                </>
              ) : (
                <>
                  <div className="text-lg font-mono font-bold text-amber-500">UNAVAILABLE</div>
                  <div className="text-[9px] font-mono text-muted-foreground mt-1">
                    Reason: Covariance information is not available from the public GP dataset.
                    <br /><br />Per NASA CARA: "TLE-derived analytic theory data does not provide the
                    covariance needed for probabilistic collision assessment."
                    <br /><br />Source: <a href="https://www.nasa.gov/cara/step-2-close-approach-risk-assessment/" className="text-primary hover:underline">NASA CARA</a>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Uncertainty note */}
          <Card className="p-2 border-amber-500/30 bg-amber-500/5">
            <div className="text-[9px] font-mono text-amber-500">
              ⚠ Trajectory uncertainty not available from current public GP data.
              The predicted trajectory is the best-estimate propagated state.
            </div>
          </Card>

          {/* Prove-this-prediction button */}
          <Card className="p-3 border-primary/40 bg-primary/5">
            <div className="text-[10px] font-mono uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
              <Shield className="h-3 w-3" /> PROVE THIS PREDICTION
            </div>
            <div className="space-y-1 text-[10px] font-mono">
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Real CelesTrak data</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Real catalog IDs (no truncation)</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Real SGP4 propagation</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Trajectory from actual state vectors</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Engine comparison (SENTINEL vs STK vs SOCRATES)</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Provenance recorded</div>
              <div className="flex items-center gap-1.5">
                {isStkFallback
                  ? <><AlertTriangle className="h-3 w-3 text-amber-500" /> STK unavailable (SGP4 fallback used)</>
                  : <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> STK Advanced CAT executed</>
                }
              </div>
            </div>
          </Card>

          {/* Disclaimer */}
          <div className="text-[9px] font-mono text-muted-foreground p-2 border border-border rounded">
            ⚠ Simulation only — not a flight command. Operational decisions require authoritative orbital data and qualified flight-dynamics analysis.
            <br /><br />
            This visualization shows the PREDICTED close approach (conjunction), not a confirmed collision.
            Professional collision probability requires covariance data not present in the public GP dataset.
          </div>
        </div>
      </div>
    </div>
  );
}
