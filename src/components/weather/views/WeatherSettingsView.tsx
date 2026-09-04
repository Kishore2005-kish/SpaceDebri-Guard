'use client';

import React, { useState } from 'react';
import { useSpaceWeather } from '../../../context/SpaceWeatherContext';
import { Sliders, Sun, Cpu, Bell, Save } from 'lucide-react';

export const WeatherSettingsView = () => {
  const { allProfiles, activeProfileId, changeProfile } = useSpaceWeather();
  const [refreshInterval, setRefreshInterval] = useState(10);
  const [modelType, setModelType] = useState('NEURAL_NET');
  const [alertThreshold, setAlertThreshold] = useState('5');
  const [isSaved, setIsSaved] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            System Control Panel
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            SIMULATION SUITES, NOTIFICATION MODULES, & MACHINE LEARNING MODELS
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left/Center Columns - Simulator Configuration */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Interactive Drill Simulation Suite */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-6">
            <div>
              <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-semibold">
                OPERATIONAL DRILL MODULE
              </span>
              <h2 className="text-lg font-bold text-white font-sans flex items-center gap-2 mt-1">
                <Sun className="h-5 w-5 text-amber-500 animate-pulse" />
                Solar Event Telemetry Simulator
              </h2>
              <p className="text-xs text-slate-400 font-sans mt-2 leading-relaxed">
                NASA mission control operators use simulations to run drills. Click any profile below to inject simulated solar weather data into the application context. The entire dashboard, alerts, recommendations, and charts will adapt instantly.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allProfiles.map((p: any) => {
                const isActive = activeProfileId === p.id;
                
                const getProfileBadgeColor = (status: string) => {
                  if (status === 'NORMAL') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                  if (status === 'WARNING') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                  return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
                };

                return (
                  <button
                    key={p.id}
                    onClick={() => changeProfile(p.id)}
                    className={`text-left p-4.5 rounded-xl border transition-all duration-300 flex flex-col justify-between group ${
                      isActive 
                        ? 'bg-blue-600/10 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.12)]' 
                        : 'bg-[#0F172A]/70 border-slate-800/80 hover:bg-[#0F172A] hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-2 w-full">
                      <div className="flex justify-between items-center">
                        <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${getProfileBadgeColor(p.status)}`}>
                          {p.status}
                        </span>
                        {isActive && (
                          <span className="h-2 w-2 rounded-full bg-blue-500 animate-ping"></span>
                        )}
                      </div>
                      <h4 className={`text-sm font-bold tracking-tight transition-colors duration-200 ${
                        isActive ? 'text-blue-400' : 'text-slate-200 group-hover:text-white'
                      }`}>
                        {p.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 leading-relaxed font-sans font-normal">
                        {p.description}
                      </p>
                    </div>

                    <div className="mt-4 pt-3.5 border-t border-slate-800/60 w-full flex justify-between items-center text-[10px] font-mono text-slate-500">
                      <span>TELEMETRY PROFILE</span>
                      <span className={`font-semibold ${isActive ? 'text-blue-400' : 'text-slate-400'}`}>
                        {isActive ? 'ACTIVE INJECTED' : 'INJECT DATA'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Selection Panel */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6">
            <h2 className="text-sm font-bold text-white uppercase font-mono mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Cpu className="h-4.5 w-4.5 text-blue-400" />
              Machine Learning Model Registry
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-400 font-bold uppercase">Active Forecasting Engine</label>
                <select
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500/50 transition-all duration-200"
                >
                  <option value="NEURAL_NET">SG-FORECAST-v4 (Neural Net)</option>
                  <option value="BOOSTED_TREES">SG-XGBOOST-v3.9 (Boosted Trees)</option>
                  <option value="ENSEMBLE">SG-HYBRID-v4.2 (Ensemble Solver)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 font-bold uppercase">Risk Index Sensitivity Level</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="range" 
                    min="1" 
                    max="10" 
                    defaultValue="7"
                    className="flex-1 accent-blue-500 bg-slate-900 border border-slate-850 h-2.5 rounded-full overflow-hidden" 
                  />
                  <span className="text-white font-bold bg-[#0F172A] px-2 py-0.5 rounded border border-slate-800 text-[10px]">7 / 10</span>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column - User Configuration Forms */}
        <div className="space-y-6">
          
          {/* Notification Threshold Panel */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5">
            <h3 className="text-sm font-bold text-white uppercase font-mono mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
              <Bell className="h-4.5 w-4.5 text-blue-400" />
              Emergency Warnings Config
            </h3>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs font-mono">
              <div className="space-y-1.5">
                <label className="text-slate-400 font-bold uppercase">NOAA Query Frequency (Minutes)</label>
                <input 
                  type="number" 
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 font-bold uppercase">Geomagnetic Alert threshold</label>
                <select
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500/50"
                >
                  <option value="4">Kp &ge; 4 (Active Conditions)</option>
                  <option value="5">Kp &ge; 5 (Minor G1 Storm)</option>
                  <option value="6">Kp &ge; 6 (Moderate G2 Storm)</option>
                  <option value="7">Kp &ge; 7 (Strong G3 Storm)</option>
                </select>
              </div>

              <div className="space-y-2 border-t border-slate-800/80 pt-4">
                <label className="text-slate-400 font-bold uppercase block mb-1">Warning Channels</label>
                
                <label className="flex items-center gap-3.5 text-slate-300 select-none py-1 group cursor-pointer">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-blue-500" />
                  <span className="text-[11px] group-hover:text-white transition-colors duration-150">Transmit satellite operator emails</span>
                </label>
                
                <label className="flex items-center gap-3.5 text-slate-300 select-none py-1 group cursor-pointer">
                  <input type="checkbox" defaultChecked className="h-4 w-4 accent-blue-500" />
                  <span className="text-[11px] group-hover:text-white transition-colors duration-150">Sound alarm in web console</span>
                </label>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 border border-blue-500/35 hover:shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaved ? 'SAVED' : 'SAVE'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Diagnostic utilities */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sliders className="h-4.5 w-4.5 text-blue-400" />
              Console Utilities
            </h3>

            <div className="space-y-3 font-mono text-[10.5px]">
              <p className="text-slate-400 leading-normal">
                Execute deep telemetry calibration on neural weights or clear local diagnostic tables.
              </p>
              
              <button 
                type="button"
                onClick={() => {
                  alert("Executing calibration algorithms... Telemetry streams re-aligned.");
                }}
                className="w-full py-2 rounded-xl bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold uppercase transition-all duration-200"
              >
                CALIBRATE NEURAL WEIGHTS
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default WeatherSettingsView;
