import React from 'react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';
import { SpaceWeatherHistoryItem } from '../../lib/weather-api';

interface TrendChartProps {
  data?: SpaceWeatherHistoryItem[];
}

export const TrendChart = ({ data }: TrendChartProps) => {
  // Format xAxis tick dates (e.g. 2026-07-06 to Jul 06)
  const formatXAxis = (tickItem: string) => {
    try {
      const date = new Date(tickItem);
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return tickItem;
    }
  };

  // Custom tooltips matching mission control telemetry layout
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value;
      let riskLabel = 'LOW';
      let textColor = 'text-emerald-400';
      
      if (value > 80) {
        riskLabel = 'CRITICAL';
        textColor = 'text-rose-400';
      } else if (value > 50) {
        riskLabel = 'HIGH';
        textColor = 'text-orange-400';
      } else if (value > 30) {
        riskLabel = 'MEDIUM';
        textColor = 'text-amber-400';
      }

      return (
        <div className="bg-[#1E293B] border border-slate-700/80 p-3 rounded-lg shadow-2xl font-mono text-xs space-y-1.5 backdrop-blur-md">
          <p className="text-slate-400 font-bold border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
            <span>TIMESTAMP:</span>
            <span className="text-slate-300">{label}</span>
          </p>
          <p className="flex justify-between items-center gap-6">
            <span className="text-slate-500">RISK INDEX:</span>
            <span className={`font-extrabold ${textColor}`}>{value}%</span>
          </p>
          <p className="flex justify-between items-center gap-6">
            <span className="text-slate-500">THREAT Lvl:</span>
            <span className={`font-extrabold uppercase px-1.5 py-0.5 rounded text-[10px] bg-slate-900 border ${
              riskLabel === 'LOW' ? 'border-emerald-500/20 text-emerald-400' :
              riskLabel === 'MEDIUM' ? 'border-amber-500/20 text-amber-400' :
              riskLabel === 'HIGH' ? 'border-orange-500/20 text-orange-400' : 'border-rose-500/20 text-rose-400'
            }`}>
              {riskLabel}
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[#1E293B] border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition-all duration-300 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-6">
        <div>
          <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-semibold">
            Predictive Model Analytics
          </span>
          <h3 className="text-lg font-bold text-white font-sans">
            AI Space Weather Risk Trend
          </h3>
        </div>
        <div className="flex gap-4 font-mono text-[10px] font-bold text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded bg-blue-500"></span>
            <span>MODEL PROJECTION (30D)</span>
          </div>
        </div>
      </div>

      <div className="h-72 w-full font-mono text-[10px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatXAxis} 
              stroke="#64748B" 
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <YAxis 
              domain={[0, 100]} 
              tickFormatter={(value) => `${value}%`}
              stroke="#64748B" 
              tickLine={false}
              axisLine={{ stroke: '#334155' }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Area 
              type="monotone" 
              dataKey="risk" 
              stroke="#3B82F6" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorRisk)" 
              dot={{ r: 2, stroke: '#3B82F6', strokeWidth: 1, fill: '#0F172A' }}
              activeDot={{ r: 5, stroke: '#60A5FA', strokeWidth: 2, fill: '#3B82F6' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default TrendChart;
