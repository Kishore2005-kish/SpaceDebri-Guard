import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatusCardProps {
  title: string;
  value: string;
  status: string;
  icon: LucideIcon;
  subtext?: string;
}

export const StatusCard = ({ title, value, status, icon: Icon, subtext }: StatusCardProps) => {
  const getStatusStyles = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'nominal':
      case 'normal':
      case 'online':
      case 'connected':
      case 'low':
        return {
          border: 'border-emerald-500/20 hover:border-emerald-500/40',
          bg: 'bg-emerald-500/5',
          text: 'text-emerald-400',
          badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
          glow: 'group-hover:shadow-[0_0_20px_rgba(34,197,94,0.15)]'
        };
      case 'warning':
      case 'elevated':
      case 'syncing':
      case 'medium':
        return {
          border: 'border-amber-500/20 hover:border-amber-500/40',
          bg: 'bg-amber-500/5',
          text: 'text-amber-400',
          badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
          glow: 'group-hover:shadow-[0_0_20px_rgba(234,179,8,0.15)]'
        };
      case 'critical':
      case 'degraded':
      case 'offline':
      case 'high':
        return {
          border: 'border-rose-500/20 hover:border-rose-500/40',
          bg: 'bg-rose-500/5',
          text: 'text-rose-400',
          badge: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
          glow: 'group-hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]'
        };
      default:
        return {
          border: 'border-slate-800 hover:border-slate-700',
          bg: 'bg-slate-800/10',
          text: 'text-slate-400',
          badge: 'bg-slate-800 text-slate-400 border border-slate-700',
          glow: 'group-hover:shadow-[0_0_20px_rgba(148,163,184,0.1)]'
        };
    }
  };

  const styles = getStatusStyles(status);

  return (
    <div className={`group relative bg-[#1E293B] border rounded-xl p-5 transition-all duration-300 ${styles.border} ${styles.glow}`}>
      {/* Decorative Grid Lines to match SpaceX aesthetic */}
      <div className="absolute top-0 right-0 w-8 h-[1px] bg-slate-800 group-hover:bg-slate-700"></div>
      <div className="absolute top-0 right-0 h-8 w-[1px] bg-slate-800 group-hover:bg-slate-700"></div>

      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold tracking-wider text-slate-400 uppercase">
          {title}
        </span>
        <div className={`p-2 rounded-lg ${styles.bg}`}>
          {Icon && <Icon className={`h-5 w-5 ${styles.text}`} />}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        <h3 className="text-2xl font-bold tracking-tight text-white font-sans">
          {value}
        </h3>
        
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-slate-500 font-mono tracking-wider">
            {subtext || 'SYSTEM DATA FEED'}
          </span>
          <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full ${styles.badge}`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatusCard;
