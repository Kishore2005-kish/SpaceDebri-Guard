'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Satellite as SatelliteIcon, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useUI } from '@/lib/store';

interface Satellite {
  id: string;
  name: string;
  intlDes: string | null;
  objectType: string;
  operationalStatus: string | null;
  isProtected: boolean;
  epoch: string;
  meanMotion: number;
  eccentricity: number;
  inclination: number;
  raan: number;
  argPerigee: number;
  meanAnomaly: number;
  bstar: number;
  semiMajorAxisKm: number | null;
  perigeeKm: number | null;
  apogeeKm: number | null;
  orbitalPeriodMin: number | null;
  source: string;
  format: string;
  retrievalTime: string;
  rawHash: string | null;
}

interface Conjunction {
  id: string;
  primarySatId: string;
  secondarySatId: string;
  primaryName: string;
  secondaryName: string;
  secondaryObjectType: string;
  tca: string;
  minRange: number;
  relVelocity: number;
  riskScore: number;
  riskLevel: string;
  confidenceScore: number;
  dataSource: string;
  retrievedAt: string;
  analysisId: string;
}

function Value({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/50 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-mono text-foreground">{value ?? '—'}</span>
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export default function SatelliteOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { selectSatellite, setView } = useUI();
  const [satellite, setSatellite] = useState<Satellite | null>(null);
  const [conjunctions, setConjunctions] = useState<Conjunction[]>([]);
  const [conjunctionLoading, setConjunctionLoading] = useState(true);
  const [conjunctionError, setConjunctionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`/api/satellites/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Satellite request failed (${response.status})`);
        return body.satellite as Satellite;
      })
      .then(value => {
        setSatellite(value);
        selectSatellite({ id: value.id, name: value.name });

        setConjunctionLoading(true);
        return fetch(`/api/conjunctions?primaryId=${encodeURIComponent(value.id)}`)
          .then(async response => {
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body.error || `Conjunction request failed (${response.status})`);
            return body.conjunctions as Conjunction[];
          })
          .then(results => setConjunctions(Array.isArray(results) ? results : []))
          .catch(reason => {
            if (reason?.name !== 'AbortError') setConjunctionError(reason instanceof Error ? reason.message : 'Failed to load conjunctions.');
          });
      })
      .catch(reason => {
        if (reason?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Failed to load satellite.');
      })
      .finally(() => {
        setLoading(false);
        setConjunctionLoading(false);
      });

    return () => controller.abort();
  }, [id, selectSatellite]);

  const dataAge = useMemo(() => {
    if (!satellite?.epoch) return '—';
    const ageHours = (Date.now() - new Date(satellite.epoch).getTime()) / 3_600_000;
    return Number.isFinite(ageHours) ? `${Math.max(0, ageHours).toFixed(1)} hours since epoch` : '—';
  }, [satellite?.epoch]);

  const backToCatalog = () => {
    setView('satellites');
    router.push('/');
  };

  const closestConjunction = conjunctions.length > 0
    ? conjunctions.reduce((closest, current) => current.minRange < closest.minRange ? current : closest)
    : null;
  const highestRiskConjunction = conjunctions.length > 0
    ? conjunctions.reduce((highest, current) => current.riskScore > highest.riskScore ? current : highest)
    : null;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center gap-2 bg-background font-mono text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading satellite…</div>;
  }

  if (error || !satellite) {
    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <Button variant="outline" size="sm" onClick={backToCatalog} className="mb-6 gap-2 font-mono text-xs"><ArrowLeft className="h-3 w-3" /> CATALOG</Button>
        <Card className="mx-auto max-w-2xl border-red-500/30 bg-red-500/5 p-6">
          <h1 className="font-mono text-lg font-bold">Satellite unavailable</h1>
          <p className="mt-2 text-sm text-red-400">{error ?? 'The requested satellite was not found.'}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto max-w-6xl space-y-4">
        <Button variant="outline" size="sm" onClick={backToCatalog} className="gap-2 font-mono text-xs"><ArrowLeft className="h-3 w-3" /> CATALOG</Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><SatelliteIcon className="h-5 w-5 text-primary" /><h1 className="text-2xl font-mono font-bold">{satellite.name}</h1></div>
            <p className="mt-1 font-mono text-xs text-muted-foreground">Satellite Overview · Catalog ID {satellite.id}</p>
          </div>
          {satellite.isProtected && <Badge variant="outline" className="gap-1 text-primary"><Shield className="h-3 w-3" /> PROTECTED</Badge>}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5"><h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-wider">Satellite Identity</h2>
            <Value label="Name" value={satellite.name} /><Value label="NORAD/catalog ID" value={satellite.id} /><Value label="Object type" value={satellite.objectType.replace('_', ' ')} /><Value label="International designator" value={satellite.intlDes} /><Value label="Operational status" value={satellite.operationalStatus} /><Value label="Protected" value={satellite.isProtected ? 'Yes' : 'No'} />
          </Card>
          <Card className="p-5"><h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-wider">Orbital Information</h2>
            <Value label="Epoch" value={formatDate(satellite.epoch)} /><Value label="Mean motion" value={`${satellite.meanMotion} rev/day`} /><Value label="Inclination" value={`${satellite.inclination}°`} /><Value label="Eccentricity" value={satellite.eccentricity} /><Value label="RAAN" value={`${satellite.raan}°`} /><Value label="Argument of perigee" value={`${satellite.argPerigee}°`} /><Value label="Mean anomaly" value={`${satellite.meanAnomaly}°`} /><Value label="BSTAR" value={satellite.bstar} /><Value label="Semi-major axis" value={satellite.semiMajorAxisKm == null ? null : `${satellite.semiMajorAxisKm.toFixed(2)} km`} /><Value label="Perigee" value={satellite.perigeeKm == null ? null : `${satellite.perigeeKm.toFixed(2)} km`} /><Value label="Apogee" value={satellite.apogeeKm == null ? null : `${satellite.apogeeKm.toFixed(2)} km`} /><Value label="Orbital period" value={satellite.orbitalPeriodMin == null ? null : `${satellite.orbitalPeriodMin.toFixed(2)} min`} />
          </Card>
          <Card className="p-5"><h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-wider">Data Source / Freshness</h2>
            <Value label="Source" value={satellite.source} /><Value label="Format" value={satellite.format} /><Value label="Retrieval time" value={formatDate(satellite.retrievalTime)} /><Value label="Orbital data age" value={dataAge} /><Value label="Raw data hash" value={satellite.rawHash} />
          </Card>
          <Card className="p-5"><h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-wider">Space Weather Risk</h2><p className="text-sm text-muted-foreground">Satellite-specific SpaceGuard analysis is not yet integrated.</p></Card>
          <Card className="p-5 lg:col-span-2">
            <h2 className="mb-3 font-mono text-sm font-bold uppercase tracking-wider">Conjunction Risk</h2>
            {conjunctionLoading && <p className="text-sm text-muted-foreground">Loading existing conjunction results…</p>}
            {!conjunctionLoading && conjunctionError && <p className="text-sm text-red-400">Unable to load conjunction results: {conjunctionError}</p>}
            {!conjunctionLoading && !conjunctionError && conjunctions.length === 0 && (
              <p className="text-sm text-muted-foreground">No conjunction results are available for this satellite. No analysis result is available; this does not indicate no conjunction risk.</p>
            )}
            {!conjunctionLoading && !conjunctionError && conjunctions.length > 0 && (
              <>
                <div className="mb-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded border border-border/60 p-3"><div className="text-[10px] uppercase text-muted-foreground">Results</div><div className="mt-1 font-mono text-xl font-bold">{conjunctions.length}</div></div>
                  <div className="rounded border border-border/60 p-3"><div className="text-[10px] uppercase text-muted-foreground">Highest risk</div><div className="mt-1 font-mono text-xl font-bold">{highestRiskConjunction?.riskLevel ?? '—'}</div></div>
                  <div className="rounded border border-border/60 p-3"><div className="text-[10px] uppercase text-muted-foreground">Closest miss distance</div><div className="mt-1 font-mono text-xl font-bold">{closestConjunction ? `${closestConjunction.minRange.toFixed(2)} km` : '—'}</div></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-border text-[10px] uppercase text-muted-foreground"><tr><th className="px-2 py-2">Secondary</th><th className="px-2 py-2">TCA</th><th className="px-2 py-2">Miss distance</th><th className="px-2 py-2">Rel velocity</th><th className="px-2 py-2">Risk</th><th className="px-2 py-2">Analysis</th></tr></thead>
                    <tbody>{conjunctions.map(c => <tr key={c.id} className="border-b border-border/50"><td className="px-2 py-2"><div className="font-mono">{c.secondaryName}</div><div className="text-[10px] text-muted-foreground">{c.secondarySatId} · {c.secondaryObjectType}</div></td><td className="px-2 py-2 font-mono">{formatDate(c.tca)}</td><td className="px-2 py-2 font-mono">{c.minRange.toFixed(2)} km</td><td className="px-2 py-2 font-mono">{c.relVelocity.toFixed(2)} km/s</td><td className="px-2 py-2 font-mono">{c.riskLevel}</td><td className="px-2 py-2 text-[10px] text-muted-foreground">{formatDate(c.retrievedAt)}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="mt-3 text-[10px] text-muted-foreground">Existing conjunction records filtered by primary catalog ID {satellite.id}. Risk values use the existing conjunction analysis; no new score is calculated here.</p>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
