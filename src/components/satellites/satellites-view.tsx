'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SatelliteDTO } from '@/lib/services';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Search, Filter, Satellite as SatIcon, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUI } from '@/lib/store';

export function SatellitesView() {
  const { selectSatellite, setView } = useUI();
  const router = useRouter();
  const [all, setAll] = useState<SatelliteDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>('ALL');
  const [protectedOnly, setProtectedOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/satellites' + (protectedOnly ? '?protected=1' : ''));
        if (!response.ok) {
          throw new Error(`Failed to load satellites (${response.status})`);
        }

        const data = await response.json();
        if (!cancelled) {
          setAll(Array.isArray(data.satellites) ? data.satellites : []);
        }
      } catch (err) {
        if (!cancelled) {
          setAll([]);
          setError(err instanceof Error ? err.message : 'Failed to load satellites.');
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
  }, [protectedOnly]);

  const filtered = all.filter(s => {
    if (q && !s.name.toLowerCase().includes(q.toLowerCase()) && !s.id.toLowerCase().includes(q.toLowerCase())) return false;
    if (type !== 'ALL' && s.objectType !== type) return false;
    return true;
  });

  const typeColor = (t: string) => {
    switch (t) {
      case 'PAYLOAD': return 'text-emerald-500 border-emerald-500/40';
      case 'DEBRIS': return 'text-amber-500 border-amber-500/40';
      case 'ROCKET_BODY': return 'text-orange-500 border-orange-500/40';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-mono font-bold">Space Object Catalog</h1>
        <p className="text-xs text-muted-foreground mt-1">Search the catalog by name, ID, or filter by object type. Protected = "our" satellites.</p>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Name or catalog ID…" className="h-8 text-xs font-mono" />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 w-40 text-xs font-mono"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="PAYLOAD">Payload</SelectItem>
            <SelectItem value="DEBRIS">Debris</SelectItem>
            <SelectItem value="ROCKET_BODY">Rocket Body</SelectItem>
            <SelectItem value="UNKNOWN">Unknown</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch checked={protectedOnly} onCheckedChange={setProtectedOnly} id="prot" />
          <Label htmlFor="prot" className="text-[11px] font-mono">PROTECTED ONLY</Label>
        </div>
      </Card>

      <Card className="p-3 border-amber-500/30 bg-amber-500/5">
        <div className="text-[10px] font-mono text-amber-500">
          ⚠ Real CelesTrak objects are labeled <b className="text-emerald-500">CelesTrak</b>. Synthetic demo
          objects are labeled <b className="text-yellow-500">SENTINEL-DEMO</b> and clearly marked below.
        </div>
      </Card>

      {error && (
        <Card className="p-3 border-red-500/30 bg-red-500/5 text-[11px] font-mono text-red-500">
          {error}
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {loading && Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-3 h-32 animate-pulse" />
        ))}
        {!loading && filtered.map(s => {
          const isReal = s.source === 'CelesTrak';
          const isDemo = s.source === 'SENTINEL-DEMO';
          return (
            <Card key={s.id} className={cn('p-3 lift-hover', isReal ? 'hover:border-emerald-500/40' : 'hover:border-yellow-500/40 border-yellow-500/20')}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {s.isProtected ? <Shield className="h-3.5 w-3.5 text-primary shrink-0" /> : <SatIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold truncate">{s.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground truncate">{s.id} · {s.intlDes ?? '—'}</div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                  <Badge variant="outline" className={cn('text-[9px] font-mono', typeColor(s.objectType))}>
                    {s.objectType.replace('_', ' ')}
                  </Badge>
                  {isReal && <span className="text-[9px] font-mono text-emerald-500">●LIVE</span>}
                  {isDemo && <span className="text-[9px] font-mono text-yellow-500">●DEMO</span>}
                </div>
              </div>
            <div className="font-mono text-[10px] space-y-0.5 text-muted-foreground">
              <div className="flex justify-between"><span>Mean motion</span><span className="tnum text-foreground">{s.meanMotion.toFixed(4)} rev/d</span></div>
              <div className="flex justify-between"><span>Inclination</span><span className="tnum text-foreground">{s.inclination.toFixed(3)}°</span></div>
              <div className="flex justify-between"><span>Eccentricity</span><span className="tnum text-foreground">{s.eccentricity.toFixed(5)}</span></div>
              <div className="flex justify-between"><span>Epoch</span><span className="tnum text-foreground">{new Date(s.epoch).toISOString().slice(0, 16)}Z</span></div>
              <div className="flex justify-between"><span>Source</span><span className="text-primary">{s.source}</span></div>
              <div className="flex justify-between"><span>Data age</span><span className="tnum text-amber-500">{((Date.now() - new Date(s.epoch).getTime()) / 3600000).toFixed(1)} h</span></div>
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded border border-primary/40 px-2 py-1.5 text-[10px] font-mono text-primary hover:bg-primary/10"
              onClick={() => {
                selectSatellite({ id: s.id, name: s.name });
                setView('satellites');
                router.push(`/satellites/${encodeURIComponent(s.id)}`);
              }}
            >
              ANALYZE SATELLITE
            </button>
          </Card>
          );
        })}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-xs font-mono text-muted-foreground">No objects match your filter.</div>
      )}
    </div>
  );
}
