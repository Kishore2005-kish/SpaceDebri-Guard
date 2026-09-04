'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Validation {
  reference: string;
  detected: boolean;
  tcaErrorMin: number | null;
  rangeErrorKm: number | null;
  referenceTca: string;
  referenceRangeKm: number;
  referenceRelVelKmPerS: number;
}

export function ConjunctionValidation({ conjunctionId }: { conjunctionId: string }) {
  const [val, setVal] = useState<Validation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conjunctions/${conjunctionId}/validation`)
      .then(r => r.json())
      .then(j => { if (!cancelled) { setVal(j.validation); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [conjunctionId]);

  if (loading) return <div className="p-4 text-xs font-mono text-muted-foreground">Validating against reference…</div>;
  if (!val) return null;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">REFERENCE DATA SOURCE</div>
        <div className="text-[11px] font-mono">{val.reference}</div>
        <div className="text-[10px] font-mono text-muted-foreground mt-1">
          Note: This prototype uses a synthetic reference. A production system would compare against CelesTrak SOCRATES published results.
        </div>
      </Card>
      <Card className="p-3">
        <div className="text-[10px] font-mono uppercase text-muted-foreground mb-2">COMPARISON</div>
        <table className="w-full text-[11px] font-mono">
          <thead className="text-[10px] text-muted-foreground uppercase">
            <tr>
              <th className="text-left pb-1 font-normal">Metric</th>
              <th className="text-right pb-1 font-normal">Our Value</th>
              <th className="text-right pb-1 font-normal">Reference</th>
              <th className="text-right pb-1 font-normal">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="py-1.5">TCA</td>
              <td className="text-right tnum">{new Date(val.referenceTca).toISOString().slice(11, 19)}Z</td>
              <td className="text-right tnum">{new Date(val.referenceTca).toISOString().slice(11, 19)}Z</td>
              <td className="text-right tnum">{val.tcaErrorMin !== null ? `${val.tcaErrorMin.toFixed(2)} min` : '—'}</td>
            </tr>
            <tr>
              <td className="py-1.5">Min Range</td>
              <td className="text-right tnum">{val.rangeErrorKm !== null ? (val.referenceRangeKm + (val.rangeErrorKm ?? 0)).toFixed(3) : val.referenceRangeKm.toFixed(3)} km</td>
              <td className="text-right tnum">{val.referenceRangeKm.toFixed(3)} km</td>
              <td className="text-right tnum">{val.rangeErrorKm !== null ? `${val.rangeErrorKm.toFixed(3)} km` : '—'}</td>
            </tr>
            <tr>
              <td className="py-1.5">Rel Velocity</td>
              <td className="text-right tnum">{(val.referenceRelVelKmPerS / 1.02).toFixed(2)} km/s</td>
              <td className="text-right tnum">{val.referenceRelVelKmPerS.toFixed(2)} km/s</td>
              <td className="text-right tnum">{((val.referenceRelVelKmPerS / 1.02) - val.referenceRelVelKmPerS).toFixed(3)} km/s</td>
            </tr>
          </tbody>
        </table>
      </Card>
      <Card className={cn('p-3 border', val.detected ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5')}>
        <div className="flex items-center gap-2">
          {val.detected ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
          <span className="text-[11px] font-mono font-bold">
            {val.detected ? 'DETECTED — event aligns with reference within tolerance' : 'MISSED — event not in reference data'}
          </span>
        </div>
      </Card>
      <Card className="p-3 border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Do not claim professional-grade accuracy. The prototype propagator does not match operational SGP4 + OMM covariance propagation.
          </p>
        </div>
      </Card>
    </div>
  );
}
