'use client';
import { ConjunctionDTO } from '@/lib/services';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export function SeparationChart({ conjunction }: { conjunction: ConjunctionDTO }) {
  const data = conjunction.separationSeries.map((s) => ({
    t: new Date(s.t).toISOString().slice(11, 16),
    range: s.range,
    tFull: new Date(s.t).toISOString(),
  }));
  const tca = new Date(conjunction.tca);
  const tcaLabel = tca.toISOString().slice(11, 16);
  return (
    <div className="h-[200px] p-2 bg-[#0a0e16]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis dataKey="t" stroke="#888" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} />
          <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 10, fontFamily: 'monospace' }} label={{ value: 'km', angle: -90, position: 'insideLeft', style: { fill: '#888', fontSize: 10 } }} />
          <Tooltip
            contentStyle={{ background: '#0a0e16', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'monospace', fontSize: 10 }}
            labelStyle={{ color: '#5ee695' }}
            formatter={(v: any) => [`${Number(v).toFixed(3)} km`, 'Range']}
            labelFormatter={(l) => `T${l}Z`}
          />
          <ReferenceLine x={tcaLabel} stroke="#ff5050" strokeDasharray="3 3" label={{ value: 'TCA', fill: '#ff5050', fontSize: 9, fontFamily: 'monospace', position: 'top' }} />
          <ReferenceLine y={conjunction.screeningThreshold} stroke="rgba(255,180,80,0.5)" strokeDasharray="2 4" label={{ value: `Screen ${conjunction.screeningThreshold} km`, fill: 'rgba(255,180,80,0.6)', fontSize: 9, fontFamily: 'monospace', position: 'right' }} />
          <Line type="monotone" dataKey="range" stroke="#5ee695" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
