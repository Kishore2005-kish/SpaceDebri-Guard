'use client';
import { useEffect, useState } from 'react';
import { ConjunctionDTO } from '@/lib/services';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrbitVisualization } from '@/components/visualization/orbit-viz';
import { SeparationChart } from '@/components/visualization/separation-chart';
import { RiskExplanation } from '@/components/conjunction/risk-explanation';
import { ManeuverSimulatorPanel } from '@/components/conjunction/maneuver-panel';
import { ConjunctionTimeline } from '@/components/conjunction/timeline';
import { ConjunctionValidation } from '@/components/conjunction/validation-panel';
import { useUI } from '@/lib/store';
import { X, Download, FileText, Radio, Shield, Activity, Clock, Gauge, Crosshair, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function levelColor(level: string) {
  switch (level) {
    case 'CRITICAL': return 'text-red-500';
    case 'HIGH': return 'text-amber-500';
    case 'MODERATE': return 'text-yellow-500';
    case 'LOW': return 'text-emerald-500';
    default: return 'text-muted-foreground';
  }
}

export function ConjunctionDetail({ conjunctionId, onClose }: { conjunctionId: string; onClose: () => void }) {
  const { toast } = useToast();
  const { openSimulation } = useUI();
  const [data, setData] = useState<ConjunctionDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/conjunctions/${conjunctionId}`)
      .then(r => r.json())
      .then(j => { setData(j.conjunction); setLoading(false); })
      .catch(() => setLoading(false));
  }, [conjunctionId]);

  const runSimulation = async () => {
    setSimulating(true);
    try {
      const r = await fetch(`/api/conjunctions/${conjunctionId}/simulate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const j = await r.json();
      toast({ title: 'Maneuver simulation complete', description: `${j.simulation?.scenarios?.length ?? 0} scenarios evaluated. Best: ${j.simulation?.bestScenario?.label ?? '—'}` });
      // Reload conjunction
      const r2 = await fetch(`/api/conjunctions/${conjunctionId}`);
      const j2 = await r2.json();
      setData(j2.conjunction);
    } finally {
      setSimulating(false);
    }
  };

  const exportReport = async () => {
    try {
      const r = await fetch('/api/reports/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conjunctionId }) });
      const j = await r.json();
      setReportId(j.id);
      toast({ title: 'Report generated', description: `Report ID: ${j.id}` });
    } catch (e: any) {
      toast({ title: 'Export failed', description: e.message, variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur flex items-center justify-center">
        <div className="font-mono text-sm text-muted-foreground">Loading conjunction…</div>
      </div>
    );
  }
  if (!data) return null;

  const tca = new Date(data.tca);
  const tcaStr = tca.toUTCString().replace(' GMT', ' UTC');

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-card/80 px-4 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Crosshair className={cn('h-5 w-5', levelColor(data.riskLevel))} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold">CONJUNCTION #{data.id.slice(-4).toUpperCase()}</span>
              <Badge variant="outline" className={cn('font-mono text-[10px] border', levelColor(data.riskLevel))}>{data.riskLevel}</Badge>
              <span className="text-[10px] text-muted-foreground font-mono">· {data.status}</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono truncate">{data.primaryName} ↔ {data.secondaryName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="default" onClick={() => openSimulation(conjunctionId)} className="gap-1.5 font-mono text-[11px] bg-primary text-primary-foreground">
            <Radio className="h-3 w-3" /> RUN ORBITAL SIMULATION
          </Button>
          <Button size="sm" variant="outline" onClick={() => openSimulation(conjunctionId)} className="gap-1.5 font-mono text-[11px] border-primary/40 text-primary">
            <Shield className="h-3 w-3" /> PROVE THIS PREDICTION
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportReport()} className="gap-1.5 font-mono text-[11px]">
            <Download className="h-3 w-3" /> EXPORT REPORT
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="font-mono text-[11px]">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_400px]">
        {/* Left: visualization + chart + maneuver */}
        <div className="overflow-y-auto scrollbar-thin p-4 space-y-3">
          {/* Key parameters strip */}
          <Card className="p-3 console-grid">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> TCA</div>
                <div className="font-mono font-bold text-sm mt-0.5 tnum">{tcaStr}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1"><Crosshair className="h-3 w-3" /> MISS DISTANCE</div>
                <div className="font-mono font-bold text-sm mt-0.5 tnum">{data.minRange < 1 ? `${(data.minRange * 1000).toFixed(0)} m` : `${data.minRange.toFixed(3)} km`}</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1"><Gauge className="h-3 w-3" /> REL VELOCITY</div>
                <div className="font-mono font-bold text-sm mt-0.5 tnum">{data.relVelocity.toFixed(2)} km/s</div>
              </div>
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground flex items-center gap-1"><Activity className="h-3 w-3" /> RISK / CONF</div>
                <div className="font-mono font-bold text-sm mt-0.5 tnum">
                  <span className={levelColor(data.riskLevel)}>{data.riskScore}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-amber-500">{data.confidenceScore}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Orbit visualization */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">ORBITAL ENCOUNTER (ECI PROJECTION)</span>
              </div>
              <Badge variant="outline" className="text-[9px] font-mono">3D-Globe View · Top-down projection</Badge>
            </div>
            <OrbitVisualization conjunction={data} />
          </Card>

          {/* Separation chart */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">SEPARATION VS TIME (±1 HOUR OF TCA)</span>
            </div>
            <SeparationChart conjunction={data} />
          </Card>

          {/* Maneuver simulator */}
          <Card className="overflow-hidden">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-amber-500/5">
              <div className="flex items-center gap-2">
                <Activity className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">MANEUVER WHAT-IF SIMULATOR</span>
              </div>
              <Button size="sm" variant="default" onClick={runSimulation} disabled={simulating} className="font-mono text-[11px] gap-1.5">
                {simulating ? 'SIMULATING…' : 'RUN SIMULATION'}
                {!simulating && <ArrowRight className="h-3 w-3" />}
              </Button>
            </div>
            <ManeuverSimulatorPanel conjunctionId={conjunctionId} />
          </Card>
        </div>

        {/* Right: tabs for risk/validation/timeline/CDM */}
        <div className="border-l border-border overflow-y-auto scrollbar-thin bg-card/30">
          <Tabs defaultValue="risk" className="w-full">
            <TabsList className="grid grid-cols-4 w-full h-9 rounded-none bg-muted/30">
              <TabsTrigger value="risk" className="text-[10px] font-mono">RISK</TabsTrigger>
              <TabsTrigger value="objects" className="text-[10px] font-mono">OBJECTS</TabsTrigger>
              <TabsTrigger value="timeline" className="text-[10px] font-mono">TIMELINE</TabsTrigger>
              <TabsTrigger value="validation" className="text-[10px] font-mono">VALIDATION</TabsTrigger>
            </TabsList>
            <TabsContent value="risk" className="p-3 m-0">
              <RiskExplanation conjunction={data} />
            </TabsContent>
            <TabsContent value="objects" className="p-3 m-0 space-y-3">
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">PRIMARY (PROTECTED)</div>
                <div className="font-mono text-sm font-bold">{data.primaryName}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{data.primarySatId}</div>
                <div className="font-mono text-[11px] mt-2 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">X</span><span className="tnum">{data.primaryState.x.toFixed(2)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Y</span><span className="tnum">{data.primaryState.y.toFixed(2)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Z</span><span className="tnum">{data.primaryState.z.toFixed(2)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">|V|</span><span className="tnum">{Math.sqrt(data.primaryState.vx ** 2 + data.primaryState.vy ** 2 + data.primaryState.vz ** 2).toFixed(3)} km/s</span></div>
                </div>
              </div>
              <Separator />
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">SECONDARY</div>
                <div className="font-mono text-sm font-bold">{data.secondaryName}</div>
                <div className="text-[10px] font-mono text-muted-foreground">{data.secondarySatId} · <Badge variant="outline" className="text-[9px] ml-1">{data.secondaryObjectType}</Badge></div>
                <div className="font-mono text-[11px] mt-2 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">X</span><span className="tnum">{data.secondaryState.x.toFixed(2)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Y</span><span className="tnum">{data.secondaryState.y.toFixed(2)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Z</span><span className="tnum">{data.secondaryState.z.toFixed(2)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">|V|</span><span className="tnum">{Math.sqrt(data.secondaryState.vx ** 2 + data.secondaryState.vy ** 2 + data.secondaryState.vz ** 2).toFixed(3)} km/s</span></div>
                </div>
              </div>
              <Separator />
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">RELATIVE POSITION (RIC)</div>
                <div className="font-mono text-[11px] mt-1 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Radial</span><span className="tnum">{data.relPosRic.radial.toFixed(3)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Along-track</span><span className="tnum">{data.relPosRic.alongTrack.toFixed(3)} km</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Cross-track</span><span className="tnum">{data.relPosRic.crossTrack.toFixed(3)} km</span></div>
                </div>
              </div>
              <Separator />
              <div>
                <div className="text-[10px] font-mono uppercase text-muted-foreground">DATA PROVENANCE</div>
                <div className="font-mono text-[11px] mt-1 space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span className="text-primary">CELESTRAK</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Format</span><span>OMM</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Data age</span><span className="tnum">{data.dataAgeHours.toFixed(1)} h</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Covariance</span><span className="text-amber-500">UNAVAILABLE</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Analysis ID</span><span className="tnum text-[9px] truncate max-w-[160px]">{data.analysisId}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Screen</span><span className="tnum">{data.screeningThreshold} km / 7d</span></div>
                </div>
              </div>
              <Separator />
              <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2">
                <div className="text-[10px] font-mono text-amber-500 mb-1">⚠ DISCLAIMER</div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Professional collision probability cannot be reliably calculated from the available data. The risk score shown is a prototype heuristic, not a Pc.
                </p>
              </div>
            </TabsContent>
            <TabsContent value="timeline" className="p-3 m-0">
              <ConjunctionTimeline conjunctionId={conjunctionId} timeline={data.timeline} />
            </TabsContent>
            <TabsContent value="validation" className="p-3 m-0">
              <ConjunctionValidation conjunctionId={conjunctionId} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
