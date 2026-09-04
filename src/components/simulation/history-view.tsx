'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, CheckCircle2, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HistoryItem {
  id: string;
  status: string;
  progress: number;
  progressMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  preset: string | null;
  engineUsed: string | null;
  conjunctionsFound: number;
  candidatesFiltered: number;
  snapshotId: string | null;
}

export function HistoryView() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const error = useState<string | null>(null)[0];

  const load = async (pageNum: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/analysis/history?page=${pageNum}&pageSize=20`);
      const j = await r.json();
      setItems(j.items || []);
      setTotal(j.total || 0);
      setHasNext(j.hasNext || false);
      setPage(pageNum);
    } catch (e: any) {
      console.error('History load failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, []);

  if (loading && items.length === 0) {
    return <div className="p-6 text-sm font-mono text-muted-foreground">Loading history…</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-mono font-bold mb-4">Analysis History</h1>
      <p className="text-xs text-muted-foreground mb-4">{total} total analyses</p>

      {items.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground font-mono">No analyses have been run yet.</p>
          <p className="text-xs text-muted-foreground font-mono mt-1">Use the Analyze tab to run a conjunction screening.</p>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <Card key={item.id} className="p-3 cursor-pointer hover:border-primary/40 transition-colors">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {item.status === 'COMPLETE' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : item.status === 'FAILED' ? (
                      <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-amber-500 shrink-0 animate-spin" />
                    )}
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold">
                        {item.preset ?? 'CUSTOM'} · {item.engineUsed ?? 'SGP4'}
                      </div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                        {new Date(item.startedAt).toISOString().slice(0, 19)}Z ·
                        {' '}{item.conjunctionsFound} conjunctions ·
                        {' '}{item.candidatesFiltered} pairs
                      </div>
                      {item.progressMessage && (
                        <div className="font-mono text-[9px] text-muted-foreground truncate mt-0.5">
                          {item.progressMessage}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    'font-mono text-[10px] font-bold shrink-0',
                    item.status === 'COMPLETE' ? 'text-emerald-500' :
                    item.status === 'FAILED' ? 'text-red-500' : 'text-amber-500'
                  )}>
                    {item.status}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {(page > 1 || hasNext) && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => load(page - 1)}
                className="font-mono text-[11px]"
              >
                ← PREV
              </Button>
              <span className="font-mono text-[10px] text-muted-foreground">
                Page {page} of {Math.ceil(total / 20) || 1}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasNext}
                onClick={() => load(page + 1)}
                className="font-mono text-[11px]"
              >
                NEXT →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
