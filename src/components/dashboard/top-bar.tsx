'use client';
import { Radio, Wifi, WifiOff, Database } from 'lucide-react';
import { useUI } from '@/lib/store';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface StatusInfo {
  status: string;
  source: string;
  lastRefreshAt: string | null;
  totalObjects: number;
  liveObjects: number;
  demoObjects: number;
  dataAgeHours: number;
  propagator: string;
}

export function TopBar() {
  const { startDemo } = useUI();
  const [now, setNow] = useState<Date | null>(null);
  const [status, setStatus] = useState<StatusInfo | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialTimer = setTimeout(() => setNow(new Date()), 0);
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(initialTimer); clearInterval(i); };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/status');
        const j = await r.json();
        if (!cancelled) setStatus(j);
      } catch {}
    };
    load();
    const i = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  const statusColor =
    status?.status === 'LIVE' ? 'text-emerald-500' :
    status?.status === 'CACHED' ? 'text-amber-500' :
    status?.status === 'DEMO' ? 'text-yellow-500' :
    'text-red-500';
  const StatusIcon = status?.status === 'LIVE' || status?.status === 'CACHED' ? Wifi : status?.status === 'DEMO' ? Database : WifiOff;

  return (
    <header className="h-11 border-b border-border bg-card/70 backdrop-blur flex items-center justify-between px-4 gap-3 shrink-0">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <span className="font-mono text-sm font-semibold tracking-wider">SENTINEL</span>
      </div>
      <div className="flex items-center gap-3">
        <div className={cn('flex items-center gap-1.5', statusColor)}>
          <StatusIcon className="h-3 w-3" />
          <span className="font-mono text-[10px] font-bold">{status?.status ?? '...'}</span>
          {status && (
            <span className="font-mono text-[9px] text-muted-foreground hidden md:inline">
              {status.liveObjects > 0 ? `${status.liveObjects} real` : `${status.demoObjects} demo`}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground hidden md:inline">
          {now ? now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—'}
        </span>
      </div>
    </header>
  );
}
