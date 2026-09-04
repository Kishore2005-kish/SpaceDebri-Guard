import React from 'react';
import { LucideIcon } from 'lucide-react';

interface WeatherCardProps {
  title: string;
  value: string;
  status: string;
  icon: LucideIcon;
  unit?: string;
  rawValue: number;
  type: 'kp' | 'bz' | 'proton' | 'xray';
}

export const WeatherCard = ({ title, value, status, icon: Icon, unit, rawValue, type }: WeatherCardProps) => {
  const getStatusStyles = (stat: string) => {
    switch (stat?.toLowerCase()) {
      case 'nominal':
        return {
          border: 'border-emerald-500/20 hover:border-emerald-500/40',
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          barColor: 'bg-emerald-500'
        };
      case 'warning':
        return {
          border: 'border-amber-500/20 hover:border-amber-500/40',
          text: 'text-amber-400',
          bg: 'bg-amber-500/10',
          barColor: 'bg-amber-500'
        };
      case 'critical':
        return {
          border: 'border-rose-500/20 hover:border-rose-500/40',
          text: 'text-rose-400',
          bg: 'bg-rose-500/10',
          barColor: 'bg-rose-500'
        };
      default:
        return {
          border: 'border-slate-800 hover:border-slate-700',
          text: 'text-slate-400',
          bg: 'bg-slate-800',
          barColor: 'bg-slate-500'
        };
    }
  };

  const styles = getStatusStyles(status);

  // Render a custom horizontal gauge meter based on the type of space weather index
  const renderGauge = () => {
    let percentage = 0;
    
    if (type === 'kp') {
      // Kp is 0-9
      percentage = Math.min(100, Math.max(0, (rawValue / 9) * 100));
    } else if (type === 'bz') {
      // Bz is +/- 30. Tilted South (negative) is critical.
      // Normalize from -30 (100% full) to +10 (0% full)
      const val = rawValue || 0;
      if (val < 0) {
        percentage = Math.min(100, (Math.abs(val) / 30) * 100);
      } else {
        percentage = 5; // tiny green indicator
      }
    } else if (type === 'proton') {
      // Proton flux ranges from 0.1 to 10,000 pfu (linear mock for simplicity)
      // Let's cap visual maximum at 1000 pfu
      const val = rawValue || 0;
      percentage = Math.min(100, Math.max(3, (val / 1000) * 100));
    } else if (type === 'xray') {
      // Xray ranges from A, B, C, M, X.
      // A = 5%, B = 20%, C = 40%, M = 65%, X = 95%
      const val = rawValue || 0;
      percentage = Math.min(100, (val / 1e-4) * 100); // Scale relative to critical flare threshold
    }

    return (
      <div className="w-full mt-3 space-y-1">
        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
          <span>MIN</span>
          <span>CRIT</span>
        </div>
        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800/40">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${styles.barColor}`}
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
      </div>
    );
  };

  return (
    <div className={`relative bg-[#1E293B] border rounded-xl p-5 hover:bg-[#1E293B]/80 transition-all duration-300 ${styles.border} group`}>
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase font-semibold">
            {title}
          </span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-bold tracking-tight text-white">
              {value}
            </span>
            {unit && <span className="text-xs text-slate-400 font-mono">{unit}</span>}
          </div>
        </div>

        <div className={`p-2.5 rounded-lg border ${styles.border} ${styles.bg}`}>
          {Icon && <Icon className={`h-5 w-5 ${styles.text}`} />}
        </div>
      </div>

      {renderGauge()}

      <div className="mt-3 flex justify-between items-center text-[10px] font-mono border-t border-slate-800/60 pt-3">
        <span className="text-slate-500 uppercase">Telemetry status:</span>
        <span className={`uppercase font-bold tracking-wider ${styles.text}`}>
          {status}
        </span>
      </div>
    </div>
  );
};

export default WeatherCard;
