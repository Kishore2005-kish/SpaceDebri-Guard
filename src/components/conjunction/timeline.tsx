'use client';
import { ConjunctionDTO } from '@/lib/services';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { Circle, GitCommit, Activity, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const STATUS_FLOW = ['NEW', 'UNDER_REVIEW', 'SIMULATING', 'MONITORING', 'RESOLVED', 'DISMISSED'] as const;

export function ConjunctionTimeline({ conjunctionId, timeline }: { conjunctionId: string; timeline: ConjunctionDTO['timeline'] }) {
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [localTimeline, setLocalTimeline] = useState(timeline);
  const { toast } = useToast();

  const updateStatus = async () => {
    if (!status) return;
    const r = await fetch(`/api/conjunctions/${conjunctionId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note: note || undefined }),
    });
    if (r.ok) {
      // Refresh timeline
      const t = await fetch(`/api/conjunctions/${conjunctionId}/timeline`).then(r => r.json());
      setLocalTimeline(t.timeline);
      setNote('');
      toast({ title: 'Status updated', description: `Event marked ${status}` });
    }
  };

  const sorted = [...localTimeline].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">EVENT LIFECYCLE</div>
        <div className="flex flex-wrap gap-1 text-[10px] font-mono mb-3">
          {STATUS_FLOW.map((s, i) => (
            <span key={s} className="flex items-center">
              <span className={cn('px-1.5 py-0.5 rounded border', i === 0 ? 'border-amber-500/40 bg-amber-500/10 text-amber-500' : 'border-border text-muted-foreground')}>
                {s}
              </span>
              {i < STATUS_FLOW.length - 1 && <span className="text-muted-foreground mx-0.5">→</span>}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          <Select onValueChange={setStatus}>
            <SelectTrigger className="h-8 text-xs font-mono"><SelectValue placeholder="Change status…" /></SelectTrigger>
            <SelectContent>
              {STATUS_FLOW.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Operator note (optional)…" className="h-16 text-xs font-mono" />
          <Button size="sm" onClick={updateStatus} disabled={!status} className="w-full font-mono text-[11px]">APPLY STATUS CHANGE</Button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">AUDIT TIMELINE</div>
        <div className="relative pl-4">
          <div className="absolute left-1 top-0 bottom-0 w-px bg-border" />
          {sorted.map((entry, i) => {
            const t = new Date(entry.time);
            const isAlert = entry.event.includes('detected') || entry.event.includes('TCA');
            const isOk = entry.event.includes('Resolved') || entry.event.includes('exported');
            const Icon = isAlert ? AlertCircle : isOk ? CheckCircle2 : GitCommit;
            return (
              <div key={i} className="relative mb-3 last:mb-0">
                <div className={cn('absolute -left-3 top-1 w-2 h-2 rounded-full', isAlert ? 'bg-amber-500' : isOk ? 'bg-emerald-500' : 'bg-primary')} />
                <div className="ml-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[11px] font-mono font-bold">{entry.event}</span>
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground">{t.toISOString().replace('T', ' ').slice(0, 19)} UTC</div>
                  {entry.detail && <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{entry.detail}</div>}
                </div>
              </div>
            );
          })}
          {sorted.length === 0 && (
            <div className="text-[11px] font-mono text-muted-foreground">No timeline entries yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
