'use client';

import { TopBar } from '@/components/dashboard/top-bar';
import { Sidebar } from '@/components/dashboard/sidebar';
import { OverviewView } from '@/components/dashboard/overview-view';
import { SatellitesView } from '@/components/satellites/satellites-view';
import { AnalyzeView } from '@/components/simulation/analyze-view';
import { SimulationListView } from '@/components/simulation/simulation-list-view';
import { HistoryView } from '@/components/simulation/history-view';
import { DocsView } from '@/components/dashboard/docs-view';
import { SimulationView } from '@/components/simulation/simulation-view';
import { useUI } from '@/lib/store';

// Space Weather imports
import { SpaceWeatherProvider } from '../context/SpaceWeatherContext';
import { WeatherDashboardView } from '../components/weather/views/WeatherDashboardView';
import { WeatherLiveView } from '../components/weather/views/WeatherLiveView';
import { WeatherHistoryView } from '../components/weather/views/WeatherHistoryView';
import { WeatherReportsView } from '../components/weather/views/WeatherReportsView';
import { WeatherSettingsView } from '../components/weather/views/WeatherSettingsView';

export default function Home() {
  const { view, simulationConjunctionId, closeSimulation } = useUI();

  return (
    <SpaceWeatherProvider>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <TopBar />
        <div className="flex flex-1 min-h-0">
          <Sidebar />
          <main className="flex-1 min-w-0 overflow-y-auto scrollbar-thin p-6">
            {view === 'overview' && <OverviewView />}
            {view === 'satellites' && <SatellitesView />}
            {view === 'analyze' && <AnalyzeView />}
            {view === 'simulation' && <SimulationListView />}
            {view === 'history' && <HistoryView />}
            {view === 'docs' && <DocsView />}
            
            {/* Space Weather views */}
            {view === 'weather-dashboard' && <WeatherDashboardView />}
            {view === 'weather-live' && <WeatherLiveView />}
            {view === 'weather-history' && <WeatherHistoryView />}
            {view === 'weather-reports' && <WeatherReportsView />}
            {view === 'weather-settings' && <WeatherSettingsView />}
          </main>
        </div>
        {simulationConjunctionId && (
          <SimulationView conjunctionId={simulationConjunctionId} onClose={closeSimulation} />
        )}
        <footer className="mt-auto border-t border-border bg-card/50 px-4 py-2 text-[10px] text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 justify-between">
          <span>SENTINEL — Conjunction Awareness (PS-04.3)</span>
          <span className="text-amber-500/80">Simulation only — not a flight command.</span>
        </footer>
      </div>
    </SpaceWeatherProvider>
  );
}
