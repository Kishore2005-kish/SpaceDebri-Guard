import React from 'react';
import { AlertCircle, AlertOctagon, Info, ShieldCheck } from 'lucide-react';

export interface SpaceWeatherAlert {
  id: string;
  type: string;
  time: string;
  message: string;
}

interface AlertsCardProps {
  alerts?: SpaceWeatherAlert[];
}

export const AlertsCard = ({ alerts = [] }: AlertsCardProps) => {
  const getAlertStyles = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'CRITICAL':
        return {
          border: 'border-rose-500/35 bg-rose-500/5',
          text: 'text-rose-400',
          badge: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
          icon: AlertOctagon
        };
      case 'WARNING':
        return {
          border: 'border-amber-500/35 bg-amber-500/5',
          text: 'text-amber-400',
          badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
          icon: AlertCircle
        };
      default:
        return {
          border: 'border-blue-500/25 bg-blue-500/5',
          text: 'text-blue-400',
          badge: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
          icon: Info
        };
    }
  };

  return (
    <div className="bg-[#1E293B] border border-slate-800/80 rounded-2xl p-5 hover:border-slate-700 transition-all duration-300 flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
        <div>
          <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-semibold">
            Broadcasting Feed
          </span>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            Active Space Guard Alerts
            {alerts.length > 0 && (
              <span className="h-2 w-2 rounded-full bg-rose-500 animate-ping"></span>
            )}
          </h3>
        </div>
        <span className="font-mono text-[10px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded">
          {alerts.length} ACTIVE
        </span>
      </div>

      <div className="flex-1 overflow-y-auto max-h-64 pr-1 space-y-3 custom-scrollbar">
        {alerts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-[#0F172A]/40 rounded-xl border border-slate-800/50">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-3">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
            </div>
            <h4 className="text-xs font-mono font-bold text-emerald-400 tracking-wider uppercase">NOAA TELEMETRY STABLE</h4>
            <p className="text-[11px] text-slate-400 mt-1 max-w-[240px] leading-relaxed">
              No active geomagnetic storms or solar flare warnings currently affecting Earth systems.
            </p>
          </div>
        ) : (
          alerts.map((alert) => {
            const styles = getAlertStyles(alert.type);
            const AlertIcon = styles.icon;

            return (
              <div 
                key={alert.id}
                className={`border rounded-xl p-3.5 flex gap-3 transition-all duration-200 hover:bg-slate-800/30 ${styles.border}`}
              >
                <div className={`p-1.5 rounded-lg h-fit bg-[#0F172A] border ${styles.border}`}>
                  <AlertIcon className={`h-4.5 w-4.5 ${styles.text}`} />
                </div>
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${styles.badge}`}>
                      {alert.type}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono font-semibold">
                      {alert.time}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
                    {alert.message}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AlertsCard;
