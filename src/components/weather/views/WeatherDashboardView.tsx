'use client';

import React from 'react';
import { useSpaceWeather } from '../../../context/SpaceWeatherContext';
import StatusCard from '../StatusCard';
import WeatherCard from '../WeatherCard';
import PredictionCard from '../PredictionCard';
import TrendChart from '../TrendChart';
import AlertsCard from '../AlertsCard';
import HistoryTable from '../HistoryTable';
import { 
  Shield, 
  Clock, 
  Activity, 
  Database, 
  Radio, 
  Zap, 
  Compass, 
  Sun 
} from 'lucide-react';

export const WeatherDashboardView = () => {
  const { profile, history } = useSpaceWeather();

  const getStatusType = (status: string) => {
    if (status === 'NORMAL' || status === 'ONLINE' || status === 'CONNECTED') return 'nominal';
    if (status === 'WARNING' || status === 'ELEVATED' || status === 'SYNCING') return 'warning';
    if (status === 'CRITICAL' || status === 'DEGRADED' || status === 'OFFLINE') return 'critical';
    return 'nominal';
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Mission Control Dashboard
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            REAL-TIME SOLAR RADAR MONITORING & GEOMAGNETIC FORECASTS
          </p>
        </div>
        <div className="bg-[#1E293B] border border-slate-800 rounded-lg px-3 py-1 text-xs font-mono text-slate-400 uppercase">
          Profile: <strong className="text-blue-400">{profile.name}</strong>
        </div>
      </div>

      {/* Row 1: High Level Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard 
          title="Current Status" 
          value={profile.currentStatusText}
          status={profile.status}
          icon={Shield}
          subtext="SYS STAT LEVEL"
        />
        <StatusCard 
          title="Tomorrow Prediction" 
          value={profile.tomorrowPrediction}
          status={getStatusType(profile.prediction.riskLevel)}
          icon={Clock}
          subtext="24HR MODEL PROJECTION"
        />
        <StatusCard 
          title="API Status" 
          value={`NOAA: ${profile.noaaStatus}`}
          status={profile.noaaStatus === 'ONLINE' ? 'nominal' : 'critical'}
          icon={Activity}
          subtext="DATA ACQUISITION FEED"
        />
        <StatusCard 
          title="Database Status" 
          value={profile.databaseStatus}
          status={profile.databaseStatus === 'CONNECTED' ? 'nominal' : 'warning'}
          icon={Database}
          subtext="LOCAL DB SYNC"
        />
      </div>

      {/* Row 2: Live Space Weather Indicator Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <WeatherCard
          title="X-Ray Flux"
          value={profile.weather.xrayFlux.value}
          status={profile.weather.xrayFlux.status}
          icon={Sun}
          unit="W/m²"
          rawValue={profile.weather.xrayFlux.raw}
          type="xray"
        />
        <WeatherCard
          title="Proton Flux"
          value={profile.weather.protonFlux.value}
          status={profile.weather.protonFlux.status}
          icon={Radio}
          unit="pfu"
          rawValue={profile.weather.protonFlux.raw}
          type="proton"
        />
        <WeatherCard
          title="Kp Index"
          value={profile.weather.kpIndex.value}
          status={profile.weather.kpIndex.status}
          icon={Zap}
          unit="Index"
          rawValue={profile.weather.kpIndex.raw}
          type="kp"
        />
        <WeatherCard
          title="Solar Wind Bz"
          value={profile.weather.solarWindBz.value}
          status={profile.weather.solarWindBz.status}
          icon={Compass}
          unit="nT"
          rawValue={profile.weather.solarWindBz.raw}
          type="bz"
        />
      </div>

      {/* Row 3: Hero AI Prediction Card */}
      <PredictionCard 
        riskLevel={profile.prediction.riskLevel}
        confidence={profile.prediction.confidence}
        reason={profile.prediction.reason}
        recommendation={profile.prediction.recommendation}
      />

      {/* Row 4: Trend Chart & Active Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrendChart data={history} />
        </div>
        <div className="lg:col-span-1">
          <AlertsCard alerts={profile.alerts} />
        </div>
      </div>

      {/* Row 5: Prediction Audit Log Table */}
      <HistoryTable data={history} limit={5} />
    </div>
  );
};

export default WeatherDashboardView;
