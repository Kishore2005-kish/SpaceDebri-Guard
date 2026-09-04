'use client';
import { useUI, ViewKey } from '@/lib/store';
import { Globe, Satellite, Zap, Activity, History, FileText, Shield, Sun, Database, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';

const GROUPS = [
  {
    title: 'CONJUNCTION ANALYSIS',
    items: [
      { key: 'overview' as const, label: 'Overview', icon: Globe },
      { key: 'satellites' as const, label: 'Satellites', icon: Satellite },
      { key: 'analyze' as const, label: 'Analyze', icon: Zap },
      { key: 'simulation' as const, label: 'Simulation', icon: Activity },
      { key: 'history' as const, label: 'History', icon: History },
    ]
  },
  {
    title: 'SPACE WEATHER FORECAST',
    items: [
      { key: 'weather-dashboard' as const, label: 'Weather Risk', icon: Shield },
      { key: 'weather-live' as const, label: 'Live Telemetry', icon: Sun },
      { key: 'weather-history' as const, label: 'Prediction Logs', icon: Database },
      { key: 'weather-reports' as const, label: 'Mission Reports', icon: FileText },
      { key: 'weather-settings' as const, label: 'Console Control', icon: Sliders },
    ]
  },
  {
    title: 'SYSTEM',
    items: [
      { key: 'docs' as const, label: 'Documentation', icon: FileText },
    ]
  }
];

export function Sidebar() {
  const { view, setView } = useUI();
  return (
    <nav className="w-48 shrink-0 border-r border-border bg-card/50 flex flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {GROUPS.map((group, groupIdx) => (
          <div key={group.title} className={cn("py-2", groupIdx > 0 && "border-t border-border/30")}>
            <div className="px-3 py-1 text-[8.5px] font-mono font-bold tracking-wider text-muted-foreground/50">
              {group.title}
            </div>
            <ul className="mt-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = view === item.key;
                return (
                  <li key={item.key}>
                    <button
                      onClick={() => setView(item.key)}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-mono tracking-wide transition-colors',
                        active
                          ? 'bg-primary/15 text-primary border-l-2 border-primary'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground border-l-2 border-transparent'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-auto p-3 border-t border-border">
        <div className="text-[9px] font-mono text-muted-foreground leading-relaxed space-y-1">
          <div className="flex justify-between"><span>Source</span><span className="text-primary">CelesTrak</span></div>
          <div className="flex justify-between"><span>Propagator</span><span>SGP4</span></div>
          <div className="flex justify-between"><span>Screen</span><span>7d / 5km</span></div>
        </div>
      </div>
    </nav>
  );
}
