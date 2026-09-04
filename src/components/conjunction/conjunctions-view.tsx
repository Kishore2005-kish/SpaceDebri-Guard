'use client';
import { useEffect, useState } from 'react';
import { ConjunctionsTable } from './conjunctions-table';
import { ConjunctionDTO } from '@/lib/services';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Filter } from 'lucide-react';

export function ConjunctionsView() {
  const [all, setAll] = useState<ConjunctionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [risk, setRisk] = useState<string>('ALL');
  const [type, setType] = useState<string>('ALL');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/conjunctions');
        const j = await r.json();
        setAll(j.conjunctions);
      } finally { setLoading(false); }
    })();
  }, []);

  const filtered = all.filter(c => {
    if (q && !c.primaryName.toLowerCase().includes(q.toLowerCase()) && !c.secondaryName.toLowerCase().includes(q.toLowerCase())) return false;
    if (risk !== 'ALL' && c.riskLevel !== risk) return false;
    if (type !== 'ALL' && c.secondaryObjectType !== type) return false;
    return true;
  });

  const counts = {
    CRITICAL: all.filter(c => c.riskLevel === 'CRITICAL').length,
    HIGH: all.filter(c => c.riskLevel === 'HIGH').length,
    MODERATE: all.filter(c => c.riskLevel === 'MODERATE').length,
    LOW: all.filter(c => c.riskLevel === 'LOW').length,
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-2xl font-mono font-bold">Conjunction Events</h1>
        <p className="text-xs text-muted-foreground mt-1">All close-approach events detected within the 7-day screening horizon (threshold 5 km).</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="font-mono text-[10px] text-red-500 border-red-500/40">CRITICAL {counts.CRITICAL}</Badge>
        <Badge variant="outline" className="font-mono text-[10px] text-amber-500 border-amber-500/40">HIGH {counts.HIGH}</Badge>
        <Badge variant="outline" className="font-mono text-[10px] text-yellow-500 border-yellow-500/40">MODERATE {counts.MODERATE}</Badge>
        <Badge variant="outline" className="font-mono text-[10px] text-emerald-500 border-emerald-500/40">LOW {counts.LOW}</Badge>
      </div>

      <Card className="p-3 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by satellite name…" className="h-8 text-xs font-mono" />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={risk} onValueChange={setRisk}>
            <SelectTrigger className="h-8 w-32 text-xs font-mono"><SelectValue placeholder="Risk" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Risk Levels</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MODERATE">Moderate</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-32 text-xs font-mono"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Types</SelectItem>
              <SelectItem value="PAYLOAD">Payload</SelectItem>
              <SelectItem value="DEBRIS">Debris</SelectItem>
              <SelectItem value="ROCKET_BODY">Rocket Body</SelectItem>
              <SelectItem value="UNKNOWN">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <ConjunctionsTable conjunctions={filtered} loading={loading} />
      </Card>
    </div>
  );
}
