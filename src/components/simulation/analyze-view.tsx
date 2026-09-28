'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Zap, Satellite, Clock, Crosshair, Filter, Gauge, Shield, CheckCircle2, ChevronRight, ChevronLeft, Loader2, AlertCircle, X, Activity, Database, AlertTriangle } from 'lucide-react';
import { useUI } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Preset {
  key: string;
  name: string;
  description: string;
  config: any;
}

interface AnalysisStatus {
  id: string;
  status: string;
  progress: number;
  progressMessage: string | null;
  conjunctionsFound: number;
  candidatesFiltered: number;
  startedAt: string;
  completedAt: string | null;
  preset: string | null;
  engineUsed: string | null;
}

const STEPS = [
  { title: 'Primary Satellite', icon: Satellite },
  { title: 'Data Source', icon: Database },
  { title: 'Time Window', icon: Clock },
  { title: 'Screening Parameters', icon: Crosshair },
  { title: 'Object Filters', icon: Filter },
  { title: 'Engine', icon: Gauge },
  { title: 'Risk Assessment', icon: Shield },
  { title: 'Review & Run', icon: CheckCircle2 },
];

export function AnalyzeView() {
  const { toast } = useToast();
  const { setView, openConjunction, selectedSatellite } = useUI();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState({
    primaryId: selectedSatellite?.catalogId ?? '25544',
    source: 'CelesTrak',
    horizonHours: 24,
    thresholdKm: 5,
    coarseStepSec: 60,
    fineStepSec: 1,
    objectTypes: ['PAYLOAD', 'DEBRIS', 'ROCKET_BODY', 'UNKNOWN'],
    engine: 'SENTINEL_SGP4',
    riskWeights: { missDistance: 0.40, dataUncertainty: 0.20, relativeVelocity: 0.15, encounterGeometry: 0.15, dataFreshness: 0.10 },
    collisionAssessmentMode: 'MISS_DISTANCE_ONLY',
  });
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (selectedSatellite) {
      setConfig(c => ({ ...c, primaryId: selectedSatellite.catalogId }));
    }
  }, [selectedSatellite]);

  useEffect(() => {
    fetch('/api/analysis').then(r => r.json()).then(j => setPresets(j.presets || []));
  }, []);

  // Poll for analysis status — robust against network failures
  useEffect(() => {
    if (!analysisId) return;
    let retryCount = 0;
    const maxRetries = 5;
    const poll = async () => {
      try {
        const r = await fetch(`/api/analysis/${analysisId}`);
        if (!r.ok) {
          if (r.status === 404) {
            setRunning(false);
            toast({ title: 'Analysis job not found', description: 'The job may have expired. Start a new analysis.', variant: 'destructive' });
            return;
          }
          throw new Error(`HTTP ${r.status}`);
        }
        const j = await r.json();
        retryCount = 0; // reset on success
        if (j.analysis) {
          setAnalysisStatus(j.analysis);
          if (j.analysis.status === 'COMPLETE') {
            setRunning(false);
            toast({ title: 'Analysis complete', description: `${j.analysis.conjunctionsFound} conjunction(s) found` });
            return;
          }
          if (j.analysis.status === 'FAILED' || j.analysis.status === 'CANCELLED') {
            setRunning(false);
            toast({ title: `Analysis ${j.analysis.status.toLowerCase()}`, description: j.analysis.progressMessage ?? '', variant: 'destructive' });
            return;
          }
        }
        setTimeout(poll, 1000);
      } catch (e: any) {
        retryCount++;
        if (retryCount >= maxRetries) {
          setRunning(false);
          toast({ title: 'Polling failed', description: `Lost connection to analysis job after ${maxRetries} retries.`, variant: 'destructive' });
          return;
        }
        // Retry after 2 seconds
        setTimeout(poll, 2000);
      }
    };
    poll();
  }, [analysisId]);

  const applyPreset = (key: string) => {
    const p = presets.find(p => p.key === key);
    if (!p) return;
    setConfig(c => ({
      ...c,
      ...p.config,
      primaryId: p.config.source === 'SENTINEL-DEMO'
        ? 'ALL_PROTECTED'
        : selectedSatellite?.catalogId ?? c.primaryId,
    }));
    toast({ title: `Preset: ${p.name}`, description: p.description });
  };

  const updateSource = (source: string) => {
    setConfig({
      ...config,
      source,
      primaryId: source === 'SENTINEL-DEMO'
        ? 'ALL_PROTECTED'
        : config.primaryId === 'ALL_PROTECTED'
          ? selectedSatellite?.catalogId ?? '25544'
          : config.primaryId,
      horizonHours: source === 'SENTINEL-DEMO' ? 168 : config.horizonHours,
      thresholdKm: source === 'SENTINEL-DEMO' ? 25 : config.thresholdKm,
    });
  };

  const runAnalysis = async () => {
    setRunning(true);
    setAnalysisStatus(null);
    try {
      const r = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset: 'CUSTOM', config }),
      });
      const j = await r.json();
      if (j.analysisId) {
        setAnalysisId(j.analysisId);
        toast({ title: 'Analysis started', description: `Primary: ${config.primaryId === '25544' ? 'ISS' : config.primaryId}, ${config.horizonHours}h, ${config.thresholdKm}km` });
      } else {
        throw new Error(j.error || 'Failed');
      }
    } catch (e: any) {
      setRunning(false);
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    }
  };

  const cancelAnalysis = async () => {
    if (!analysisId) return;
    await fetch(`/api/analysis/${analysisId}`, { method: 'DELETE' });
    setRunning(false);
  };

  // Running progress view — show IMMEDIATELY when running=true, even before
  // the first poll response arrives (so the user sees instant feedback)
  if (running) {
    const status = analysisStatus?.status ?? 'STARTING';
    const progress = analysisStatus?.progress ?? 0;
    const message = analysisStatus?.progressMessage ?? 'Starting analysis…';
    const found = analysisStatus?.conjunctionsFound ?? 0;
    const pairs = analysisStatus?.candidatesFiltered ?? 0;
    const elapsed = analysisStatus
      ? Math.floor((Date.now() - new Date(analysisStatus.startedAt).getTime()) / 1000)
      : 0;
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-2xl font-mono font-bold mb-4">Analysis In Progress</h1>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className={cn('font-mono text-sm font-bold',
              status === 'COMPLETE' ? 'text-emerald-500' :
              status === 'FAILED' ? 'text-red-500' : 'text-amber-500')}>
              {status.replace(/_/g, ' ')}
            </div>
            <div className="font-mono text-2xl font-bold tnum">{progress}%</div>
          </div>
          <div className="h-3 bg-muted rounded overflow-hidden mb-4">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-xs font-mono text-muted-foreground mb-4">{message}</div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Conjunctions</div>
              <div className="text-xl font-mono font-bold tnum text-emerald-500">{found}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Pairs Screened</div>
              <div className="text-xl font-mono font-bold tnum">{pairs}</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Elapsed</div>
              <div className="text-xl font-mono font-bold tnum">{elapsed}s</div>
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-muted-foreground">Engine</div>
              <div className="text-sm font-mono font-bold">{analysisStatus?.engineUsed ?? 'SGP4'}</div>
            </div>
          </div>
          {status !== 'COMPLETE' && status !== 'FAILED' && (
            <Button size="sm" variant="destructive" onClick={cancelAnalysis} className="mt-4 gap-1.5 font-mono text-[11px]">
              <X className="h-3 w-3" /> CANCEL ANALYSIS
            </Button>
          )}
          {status === 'COMPLETE' && (
            <div className="flex gap-2 mt-4">
              <Button size="sm" onClick={() => setView('simulation')} className="gap-1.5 font-mono text-[11px]">
                <AlertTriangle className="h-3 w-3" /> VIEW CLOSE APPROACHES
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setRunning(false); setAnalysisStatus(null); setAnalysisId(null); }} className="font-mono text-[11px]">
                NEW ANALYSIS
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  // Configuration wizard
  const currentStep = STEPS[step];
  const Icon = currentStep.icon;

  return (
    <div className="p-4 max-w-4xl">
      <h1 className="text-2xl font-mono font-bold mb-1">New Conjunction Analysis</h1>
      <p className="text-xs text-muted-foreground mb-4">Configure every analysis parameter. The analysis runs as a background job — you'll see live progress.</p>

      {/* Presets */}
      <Card className="p-3 mb-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">PRESETS</div>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => applyPreset(p.key)}
              className="px-3 py-1.5 text-[10px] font-mono rounded border border-border hover:border-primary hover:bg-primary/5 transition-colors"
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>
      </Card>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto scrollbar-thin">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          return (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono',
                i === step ? 'bg-primary text-primary-foreground' :
                i < step ? 'bg-emerald-500/20 text-emerald-500' : 'text-muted-foreground'
              )}>
                <StepIcon className="h-3 w-3" />
                <span className="hidden sm:inline">{i + 1}. {s.title}</span>
                <span className="sm:hidden">{i + 1}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card className="p-4 mb-4 min-h-[200px]">
        <div className="flex items-center gap-2 mb-4">
          <Icon className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-mono font-bold">{currentStep.title}</h2>
        </div>

        {step === 0 && (
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] font-mono uppercase">Primary Satellite</Label>
              <Select value={config.primaryId} onValueChange={v => setConfig({ ...config, primaryId: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25544">ISS (ZARYA) — NORAD 25544</SelectItem>
                  <SelectItem value="ALL_PROTECTED">All Protected Satellites</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground p-2 bg-muted/30 rounded">
              The primary satellite is the one being screened against the catalog. ISS is the default for the evaluator demo.
              Only real CelesTrak catalog objects are used — no synthetic data in LIVE mode.
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] font-mono uppercase">Data Source</Label>
              <Select value={config.source} onValueChange={updateSource}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CelesTrak">● LIVE — Real CelesTrak data</SelectItem>
                  <SelectItem value="SENTINEL-DEMO">● DEMO — Synthetic data (for testing)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground p-2 bg-muted/30 rounded">
              LIVE mode uses real public GP/OMM data from CelesTrak. DEMO mode uses synthetic objects (clearly labeled).
              Never mix the two.
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <Label className="text-[10px] font-mono uppercase">Screening Horizon (hours)</Label>
            <div className="flex items-center gap-3">
              <Slider
                value={[config.horizonHours]}
                onValueChange={v => setConfig({ ...config, horizonHours: v[0] })}
                min={1} max={168} step={1}
                className="flex-1"
              />
              <span className="font-mono text-sm font-bold tnum w-16 text-right">{config.horizonHours}h ({(config.horizonHours / 24).toFixed(1)}d)</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfig({ ...config, horizonHours: 24 })} className="font-mono text-[10px]">24h</Button>
              <Button size="sm" variant="outline" onClick={() => setConfig({ ...config, horizonHours: 48 })} className="font-mono text-[10px]">48h</Button>
              <Button size="sm" variant="outline" onClick={() => setConfig({ ...config, horizonHours: 72 })} className="font-mono text-[10px]">72h</Button>
              <Button size="sm" variant="outline" onClick={() => setConfig({ ...config, horizonHours: 168 })} className="font-mono text-[10px]">7 days</Button>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">Default: 24h for quick demo. 168h (7 days) for standard operational screening.</div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] font-mono uppercase">Conjunction Threshold (km)</Label>
              <div className="flex items-center gap-3 mt-1">
                <Slider value={[config.thresholdKm]} onValueChange={v => setConfig({ ...config, thresholdKm: v[0] })} min={0.1} max={25} step={0.1} className="flex-1" />
                <span className="font-mono text-sm font-bold tnum w-16 text-right">{config.thresholdKm} km</span>
              </div>
              <div className="text-[10px] font-mono text-amber-500 mt-1">⚠ Screening threshold is a candidate-conjunction filter, NOT a collision-probability threshold.</div>
            </div>
            <div>
              <Label className="text-[10px] font-mono uppercase">Coarse Step (seconds)</Label>
              <Select value={String(config.coarseStepSec)} onValueChange={v => setConfig({ ...config, coarseStepSec: parseInt(v) })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 sec (very fine — slow)</SelectItem>
                  <SelectItem value="30">30 sec</SelectItem>
                  <SelectItem value="60">60 sec (default)</SelectItem>
                  <SelectItem value="120">120 sec</SelectItem>
                  <SelectItem value="300">300 sec (fast)</SelectItem>
                  <SelectItem value="600">600 sec (very fast)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] font-mono uppercase">Fine Step (seconds)</Label>
              <Select value={String(config.fineStepSec)} onValueChange={v => setConfig({ ...config, fineStepSec: parseInt(v) })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.1">0.1 sec (ultra-fine)</SelectItem>
                  <SelectItem value="0.5">0.5 sec</SelectItem>
                  <SelectItem value="1">1 sec (default)</SelectItem>
                  <SelectItem value="5">5 sec (fast)</SelectItem>
                  <SelectItem value="10">10 sec (very fast)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Label className="text-[10px] font-mono uppercase">Secondary Object Filters</Label>
            <div className="grid grid-cols-2 gap-2">
              {['PAYLOAD', 'DEBRIS', 'ROCKET_BODY', 'UNKNOWN'].map(type => (
                <div key={type} className="flex items-center gap-2">
                  <Switch
                    checked={config.objectTypes.includes(type)}
                    onCheckedChange={checked => {
                      const types = checked
                        ? [...config.objectTypes, type]
                        : config.objectTypes.filter(t => t !== type);
                      setConfig({ ...config, objectTypes: types });
                    }}
                  />
                  <Label className="font-mono text-[11px]">{type.replace('_', ' ')}</Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <Label className="text-[10px] font-mono uppercase">Propagation Engine</Label>
            <Select value={config.engine} onValueChange={v => setConfig({ ...config, engine: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SENTINEL_SGP4">SENTINEL SGP4 (fast screening)</SelectItem>
                <SelectItem value="STK_ADVANCED_CAT">STK Advanced CAT (professional — requires STK)</SelectItem>
                <SelectItem value="BOTH">Both (SENTINEL SGP4 + STK comparison)</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-[10px] font-mono text-muted-foreground p-2 bg-muted/30 rounded">
              STK Advanced CAT requires Ansys STK to be installed and running.
              If STK is unavailable, the system automatically falls back to SGP4
              (clearly labeled as such — never faked).
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <div>
              <Label className="text-[10px] font-mono uppercase">Risk Model Weights (must sum to 1.0)</Label>
              {Object.entries(config.riskWeights).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[11px] w-32">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                  <Slider value={[Math.round(val * 100)]} onValueChange={v => {
                    const weights = { ...config.riskWeights, [key]: v[0] / 100 };
                    setConfig({ ...config, riskWeights: weights });
                  }} min={0} max={100} step={5} className="flex-1" />
                  <span className="font-mono text-[11px] tnum w-10 text-right">{Math.round(val * 100)}%</span>
                </div>
              ))}
              <div className={cn('font-mono text-[10px] mt-2',
                Math.abs(Object.values(config.riskWeights).reduce((a, b) => a + b, 0) - 1.0) < 0.01 ? 'text-emerald-500' : 'text-red-500')}>
                Sum: {(Object.values(config.riskWeights).reduce((a, b) => a + b, 0) * 100).toFixed(0)}% {Math.abs(Object.values(config.riskWeights).reduce((a, b) => a + b, 0) - 1.0) < 0.01 ? '✓' : '⚠ must sum to 100%'}
              </div>
            </div>
            <div>
              <Label className="text-[10px] font-mono uppercase">Collision Assessment Mode</Label>
              <Select value={config.collisionAssessmentMode} onValueChange={v => setConfig({ ...config, collisionAssessmentMode: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MISS_DISTANCE_ONLY">Miss distance only (no Pc)</SelectItem>
                  <SelectItem value="PC_IF_COVARIANCE">Pc if covariance available</SelectItem>
                  <SelectItem value="AUTOMATIC">Automatic</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-[10px] font-mono text-amber-500 mt-2 p-2 bg-amber-500/5 rounded">
                ⚠ Public GP data does NOT contain covariance. Collision probability will show
                "UNAVAILABLE" regardless of this setting. Pc is only calculated when valid
                covariance data is provided (e.g. from CDMs). Per NASA CARA.
              </div>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-3">
            <div className="text-[10px] font-mono uppercase tracking-wider text-primary">ANALYSIS SUMMARY</div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div><span className="text-muted-foreground">Primary:</span> {config.primaryId === '25544' ? 'ISS (ZARYA) 25544' : config.primaryId === 'ALL_PROTECTED' ? 'All Protected' : config.primaryId}</div>
              <div><span className="text-muted-foreground">Data:</span> {config.source === 'CelesTrak' ? '● LIVE CelesTrak' : '● DEMO'}</div>
              <div><span className="text-muted-foreground">Window:</span> {config.horizonHours}h ({(config.horizonHours / 24).toFixed(1)}d)</div>
              <div><span className="text-muted-foreground">Threshold:</span> {config.thresholdKm} km</div>
              <div><span className="text-muted-foreground">Coarse step:</span> {config.coarseStepSec}s</div>
              <div><span className="text-muted-foreground">Fine step:</span> {config.fineStepSec}s</div>
              <div><span className="text-muted-foreground">Engine:</span> {config.engine.replace(/_/g, ' ')}</div>
              <div><span className="text-muted-foreground">Objects:</span> {config.objectTypes.map(t => t.replace('_', ' ')).join(', ')}</div>
              <div><span className="text-muted-foreground">Assessment:</span> {config.collisionAssessmentMode.replace(/_/g, ' ')}</div>
              <div><span className="text-muted-foreground">Risk weights:</span> {(config.riskWeights.missDistance * 100).toFixed(0)}/{(config.riskWeights.dataUncertainty * 100).toFixed(0)}/{(config.riskWeights.relativeVelocity * 100).toFixed(0)}/{(config.riskWeights.encounterGeometry * 100).toFixed(0)}/{(config.riskWeights.dataFreshness * 100).toFixed(0)}</div>
            </div>
            {/* Performance preview */}
            <div className="mt-3 p-3 border border-border rounded bg-card/50">
              <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">ESTIMATED ANALYSIS</div>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono">
                <div>
                  <div className="text-[9px] text-muted-foreground">Catalog objects</div>
                  <div className="font-bold tnum">46</div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground">After filter</div>
                  <div className="font-bold tnum">~{Math.ceil(46 * (config.objectTypes.length / 4) * 0.8)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-muted-foreground">Fine candidates</div>
                  <div className="font-bold tnum">~{Math.max(1, Math.ceil(46 * (config.objectTypes.length / 4) * 0.8 * 0.08 * 0.15))}</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[10px] font-mono">
                <span className="text-muted-foreground">Complexity:</span>
                <span className={cn(
                  'font-bold',
                  config.horizonHours * 60 / (config.coarseStepSec || 60) * 46 / 50000 < 5 ? 'text-emerald-500' :
                  config.horizonHours * 60 / (config.coarseStepSec || 60) * 46 / 50000 < 30 ? 'text-amber-500' :
                  'text-red-500'
                )}>
                  {config.horizonHours * 60 / (config.coarseStepSec || 60) * 46 / 50000 < 5 ? 'LOW' :
                   config.horizonHours * 60 / (config.coarseStepSec || 60) * 46 / 50000 < 30 ? 'MODERATE' :
                   config.horizonHours * 60 / (config.coarseStepSec || 60) * 46 / 50000 < 120 ? 'HIGH' : 'EXTREME'}
                </span>
                <span className="text-muted-foreground">· Est. runtime: ~{Math.max(1, Math.ceil(config.horizonHours * 3600 / (config.coarseStepSec || 60) * 46 / 50000))}s</span>
              </div>
              {config.horizonHours * 60 / (config.coarseStepSec || 60) * 46 / 50000 > 120 && (
                <div className="mt-2 p-2 border border-red-500/30 bg-red-500/5 rounded text-[10px] font-mono text-red-500">
                  ⚠ This configuration is computationally expensive. Consider a shorter time window or larger coarse step.
                </div>
              )}
            </div>
            <div className="text-[10px] font-mono text-amber-500 p-2 bg-amber-500/5 rounded border border-amber-500/20 mt-2">
              ⚠ This analysis will screen the selected primary against all matching catalog objects.
              Results are conjunction predictions, NOT collision confirmations.
              Collision probability requires covariance data (UNAVAILABLE from public GP).
            </div>
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} className="gap-1.5 font-mono text-[11px]">
          <ChevronLeft className="h-3 w-3" /> BACK
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="sm" onClick={() => setStep(step + 1)} className="gap-1.5 font-mono text-[11px]">
            NEXT <ChevronRight className="h-3 w-3" />
          </Button>
        ) : (
          <Button size="sm" variant="default" onClick={runAnalysis} className="gap-1.5 font-mono text-[11px]">
            <Zap className="h-3 w-3" /> RUN ANALYSIS
          </Button>
        )}
      </div>
    </div>
  );
}
