'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Zap, Settings, X, Activity, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useUI } from '@/lib/store';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

interface Preset {
  key: string;
  name: string;
  description: string;
  config: any;
}

export function AnalysisPanel({ onAnalysisComplete }: { onAnalysisComplete?: () => void }) {
  const { toast } = useToast();
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('QUICK');
  const [showConfig, setShowConfig] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [primaryId, setPrimaryId] = useState('25544');  // ISS by default

  // Load presets
  useEffect(() => {
    fetch('/api/analysis').then(r => r.json()).then(j => setPresets(j.presets || []));
  }, []);

  // Poll for analysis status
  useEffect(() => {
    if (!analysisId) return;
    const poll = async () => {
      const r = await fetch(`/api/analysis/${analysisId}`);
      const j = await r.json();
      if (j.analysis) {
        setAnalysisStatus(j.analysis);
        if (j.analysis.status === 'COMPLETE') {
          setRunning(false);
          if (onAnalysisComplete) onAnalysisComplete();
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
    };
    poll();
  }, [analysisId]);

  const startAnalysis = async () => {
    setRunning(true);
    setAnalysisStatus(null);
    try {
      const r = await fetch('/api/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: selectedPreset,
          config: { primaryId },
        }),
      });
      const j = await r.json();
      if (j.analysisId) {
        setAnalysisId(j.analysisId);
        toast({ title: 'Analysis started', description: `Preset: ${selectedPreset}, Primary: ${primaryId === '25544' ? 'ISS (25544)' : primaryId}` });
      } else {
        throw new Error(j.error || 'Failed to start');
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
    toast({ title: 'Analysis cancelled' });
  };

  return (
    <Card className="p-3 border-primary/30 bg-primary/5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Zap className="h-3 w-3" /> CONJUNCTION ANALYSIS
        </div>
        <div className="flex gap-1">
          {presets.map(p => (
            <button
              key={p.key}
              onClick={() => setSelectedPreset(p.key)}
              className={cn(
                'px-2 py-1 text-[9px] font-mono rounded border',
                selectedPreset === p.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
              title={p.description}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar */}
      {analysisStatus && running && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
            <span className={cn(
              analysisStatus.status === 'COMPLETE' ? 'text-emerald-500' :
              analysisStatus.status === 'FAILED' ? 'text-red-500' :
              'text-amber-500'
            )}>
              {analysisStatus.status.replace(/_/g, ' ')}
            </span>
            <span className="tnum">{analysisStatus.progress}%</span>
          </div>
          <div className="h-2 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${analysisStatus.progress}%` }}
            />
          </div>
          <div className="text-[9px] font-mono text-muted-foreground mt-1">
            {analysisStatus.progressMessage}
          </div>
          {analysisStatus.conjunctionsFound > 0 && (
            <div className="text-[9px] font-mono text-emerald-500 mt-0.5">
              {analysisStatus.conjunctionsFound} conjunction(s) found · {analysisStatus.candidatesFiltered} pairs screened
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2">
        <select
          value={primaryId}
          onChange={(e) => setPrimaryId(e.target.value)}
          disabled={running}
          className="h-8 text-[10px] font-mono bg-card border border-border rounded px-2"
        >
          <option value="25544">ISS (ZARYA) — NORAD 25544</option>
          <option value="">All Protected Satellites</option>
        </select>
        {!running ? (
          <Button size="sm" onClick={startAnalysis} className="gap-1.5 font-mono text-[11px]">
            <Zap className="h-3 w-3" /> RUN ANALYSIS
          </Button>
        ) : (
          <Button size="sm" variant="destructive" onClick={cancelAnalysis} className="gap-1.5 font-mono text-[11px]">
            <X className="h-3 w-3" /> CANCEL
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setShowConfig(s => !s)} className="font-mono text-[10px] gap-1">
          <Settings className="h-3 w-3" /> {showConfig ? 'HIDE' : 'CONFIG'}
        </Button>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="mt-2 p-2 border border-border rounded bg-card/50 text-[10px] font-mono space-y-1">
          <div className="text-muted-foreground">{presets.find(p => p.key === selectedPreset)?.description}</div>
          <div className="grid grid-cols-2 gap-1">
            <div>Horizon: {presets.find(p => p.key === selectedPreset)?.config.horizonHours ?? 168}h</div>
            <div>Threshold: {presets.find(p => p.key === selectedPreset)?.config.thresholdKm ?? 5} km</div>
            <div>Engine: {presets.find(p => p.key === selectedPreset)?.config.engine ?? 'SENTINEL_SGP4'}</div>
            <div>Max secondaries: {presets.find(p => p.key === selectedPreset)?.config.maxSecondaries ?? 100}</div>
          </div>
          <button
            onClick={() => useUI.getState().setView('analyze')}
            className="text-primary hover:underline mt-1 text-[10px]"
          >
            → Full configuration wizard (all parameters)
          </button>
        </div>
      )}
    </Card>
  );
}
