import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, HelpCircle, CheckCircle2 } from 'lucide-react';

interface PredictionCardProps {
  riskLevel: string;
  confidence: number;
  reason: string;
  recommendation: string;
}

export const PredictionCard = ({ riskLevel, confidence, reason, recommendation }: PredictionCardProps) => {
  const getRiskStyles = (risk: string) => {
    switch (risk?.toUpperCase()) {
      case 'LOW':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          text: 'text-emerald-400',
          glow: 'shadow-[0_0_30px_rgba(34,197,94,0.15)] border-emerald-500/30',
          icon: ShieldCheck,
          accent: 'emerald'
        };
      case 'MEDIUM':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          text: 'text-amber-400',
          glow: 'shadow-[0_0_30px_rgba(234,179,8,0.15)] border-amber-500/30',
          icon: AlertTriangle,
          accent: 'amber'
        };
      case 'HIGH':
        return {
          bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
          text: 'text-orange-400',
          glow: 'shadow-[0_0_30px_rgba(249,115,22,0.15)] border-orange-500/30',
          icon: ShieldAlert,
          accent: 'orange'
        };
      case 'CRITICAL':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          text: 'text-rose-400',
          glow: 'shadow-[0_0_30px_rgba(239,68,68,0.2)] border-rose-500/30',
          icon: ShieldAlert,
          accent: 'rose'
        };
      default:
        return {
          bg: 'bg-slate-800 text-slate-400 border-slate-700',
          text: 'text-slate-400',
          glow: 'border-slate-800',
          icon: HelpCircle,
          accent: 'slate'
        };
    }
  };

  const styles = getRiskStyles(riskLevel);
  const Icon = styles.icon;

  // Calculate SVG stroke offset for the confidence radial dial
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (confidence / 100) * circumference;

  return (
    <div className={`bg-[#1E293B] border rounded-2xl p-6 lg:p-8 transition-all duration-500 ${styles.glow} relative overflow-hidden group`}>
      {/* SpaceX Style Aesthetic Grid Gridlines overlay */}
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-blue-500/0 via-blue-500/20 to-blue-500/0"></div>
      
      <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
        
        {/* Left Column - Confidence Radial Dial */}
        <div className="relative shrink-0 flex flex-col items-center justify-center bg-[#0F172A]/60 border border-slate-800/80 p-6 rounded-2xl">
          <span className="text-[10px] text-slate-500 font-mono tracking-wider mb-4 uppercase">
            Prediction Confidence
          </span>
          <div className="relative w-36 h-36 flex items-center justify-center">
            {/* SVG circle track */}
            <svg className="absolute -rotate-90 w-full h-full">
              <circle
                cx="72"
                cy="72"
                r={radius}
                className="stroke-slate-800"
                strokeWidth="10"
                fill="transparent"
              />
              <circle
                cx="72"
                cy="72"
                r={radius}
                className={`transition-all duration-1000 ${
                  styles.accent === 'emerald' ? 'stroke-emerald-500' :
                  styles.accent === 'amber' ? 'stroke-amber-500' :
                  styles.accent === 'orange' ? 'stroke-orange-500' : 'stroke-rose-500'
                }`}
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>
            <div className="text-center">
              <span className="text-3xl font-extrabold font-mono text-white tracking-tight">
                {confidence}%
              </span>
              <p className="text-[9px] text-slate-400 font-semibold tracking-widest uppercase mt-0.5">Confidence</p>
            </div>
          </div>
          <span className="text-[9px] text-slate-500 font-mono mt-4">AI MODEL: SG-FORECAST-v4</span>
        </div>

        {/* Right Column - Prediction Details */}
        <div className="flex-1 flex flex-col justify-between h-full gap-4">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-500 uppercase tracking-widest">
                AI PREDICTION ANALYSIS
              </span>
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-bold tracking-wider uppercase animate-pulse ${styles.bg}`}>
                <Icon className="h-4 w-4" />
                <span>{riskLevel} RISK</span>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
                Predictive Risk Summary
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed font-sans">
                {reason}
              </p>
            </div>
          </div>

          <div className="border-t border-slate-800/80 pt-4 mt-2">
            <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-2.5 flex items-center gap-2">
              <CheckCircle2 className={`h-4 w-4 ${styles.text}`} />
              REMEDIAL RECOMMENDATIONS
            </h4>
            <div className="bg-[#0F172A]/40 rounded-xl border border-slate-800/60 p-4">
              <p className="text-xs text-slate-300 leading-relaxed font-mono">
                {recommendation}
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PredictionCard;
