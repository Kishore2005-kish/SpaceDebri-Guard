'use client';
import { ConjunctionDTO } from '@/lib/services';
import { Skeleton } from '@/components/ui/skeleton';
import { useUI } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

function levelColor(level: string) {
  switch (level) {
    case 'CRITICAL': return 'text-red-500';
    case 'HIGH': return 'text-amber-500';
    case 'MODERATE': return 'text-yellow-500';
    case 'LOW': return 'text-emerald-500';
    default: return 'text-muted-foreground';
  }
}

function levelBg(level: string) {
  switch (level) {
    case 'CRITICAL': return 'bg-red-500/10 border-red-500/30';
    case 'HIGH': return 'bg-amber-500/10 border-amber-500/30';
    case 'MODERATE': return 'bg-yellow-500/10 border-yellow-500/30';
    case 'LOW': return 'bg-emerald-500/10 border-emerald-500/30';
    default: return 'bg-muted';
  }
}

export function ConjunctionsTable({
  conjunctions, loading, compact,
}: {
  conjunctions: ConjunctionDTO[];
  loading?: boolean;
  compact?: boolean;
}) {
  const { openConjunction } = useUI();
  if (loading) {
    return (
      <div className="p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 mb-1" />
        ))}
      </div>
    );
  }
  if (conjunctions.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground font-mono text-xs">
        No conjunctions detected within screening horizon.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full text-xs">
        <thead className="bg-muted/30">
          <tr className="text-[10px] font-mono uppercase text-muted-foreground">
            <th className="text-left px-3 py-1.5 font-normal">Event</th>
            <th className="text-left px-3 py-1.5 font-normal">Primary</th>
            <th className="text-left px-3 py-1.5 font-normal">Secondary</th>
            <th className="text-left px-3 py-1.5 font-normal hidden md:table-cell">Type</th>
            <th className="text-right px-3 py-1.5 font-normal">TCA</th>
            <th className="text-right px-3 py-1.5 font-normal">Distance</th>
            <th className="text-right px-3 py-1.5 font-normal hidden md:table-cell">Rel vel</th>
            <th className="text-right px-3 py-1.5 font-normal">Risk</th>
            <th className="text-right px-3 py-1.5 font-normal hidden md:table-cell">Conf</th>
            <th className="text-right px-3 py-1.5 font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {conjunctions.map((c) => {
            const tca = new Date(c.tca);
            const tcaStr = tca.toISOString().replace('T', ' ').slice(5, 16) + 'Z';
            const minLabel = c.minRange < 1 ? `${(c.minRange * 1000).toFixed(0)} m` : `${c.minRange.toFixed(2)} km`;
            return (
              <tr
                key={c.id}
                onClick={() => openConjunction(c.id)}
                className="border-t border-border hover:bg-muted/30 cursor-pointer transition-colors"
              >
                <td className="px-3 py-1.5 font-mono text-[11px]">
                  <div className={cn('inline-block px-1.5 py-0.5 rounded border', levelBg(c.riskLevel))}>
                    #{c.id.slice(-4).toUpperCase()}
                  </div>
                  {c.dataSource === 'CelesTrak' && (
                    <span className="ml-1 text-[9px] text-emerald-500" title="Real CelesTrak data">●LIVE</span>
                  )}
                  {c.dataSource === 'SENTINEL-DEMO' && (
                    <span className="ml-1 text-[9px] text-yellow-500" title="Synthetic demo data">●DEMO</span>
                  )}
                </td>
                <td className="px-3 py-1.5 font-mono">{c.primaryName}</td>
                <td className="px-3 py-1.5 font-mono">{c.secondaryName}</td>
                <td className="px-3 py-1.5 font-mono text-[10px] hidden md:table-cell">
                  <Badge variant="outline" className="text-[9px]">{c.secondaryObjectType}</Badge>
                </td>
                <td className="px-3 py-1.5 font-mono text-right tnum text-[10px]">{tcaStr}</td>
                <td className="px-3 py-1.5 font-mono text-right tnum">{minLabel}</td>
                <td className="px-3 py-1.5 font-mono text-right tnum text-[10px] hidden md:table-cell">{c.relVelocity.toFixed(2)}</td>
                <td className={cn('px-3 py-1.5 font-mono text-right font-bold tnum', levelColor(c.riskLevel))}>{c.riskScore}</td>
                <td className="px-3 py-1.5 font-mono text-right tnum text-[10px] hidden md:table-cell text-amber-500">{c.confidenceScore}</td>
                <td className="px-3 py-1.5 font-mono text-right text-[10px]">
                  <span className={cn(c.status === 'NEW' && 'text-amber-500', c.status === 'RESOLVED' && 'text-emerald-500')}>
                    {c.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
