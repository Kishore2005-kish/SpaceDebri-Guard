'use client';

import React, { useState, useMemo } from 'react';
import { useSpaceWeather } from '../../../context/SpaceWeatherContext';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { FileText, Printer, CheckCircle, TrendingUp } from 'lucide-react';

export const WeatherReportsView = () => {
  const { history, profile } = useSpaceWeather();
  const [reportType, setReportType] = useState('DAILY');
  const [selectedFormat, setSelectedFormat] = useState('PDF');
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportReady, setReportReady] = useState(false);

  // Compute threat level metrics dynamically based on active history data
  const threatDistribution = useMemo(() => {
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<string, number>;
    history.forEach(item => {
      const label = item.riskLabel?.toUpperCase() || 'LOW';
      if (counts[label] !== undefined) {
        counts[label]++;
      }
    });

    return [
      { name: 'Low Risk', value: counts.LOW, color: '#10B981' },
      { name: 'Medium Risk', value: counts.MEDIUM, color: '#F59E0B' },
      { name: 'High Risk', value: counts.HIGH, color: '#F97316' },
      { name: 'Critical Risk', value: counts.CRITICAL, color: '#EF4444' }
    ].filter(item => item.value > 0);
  }, [history]);

  const handleGenerateReport = (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setReportReady(false);
    setTimeout(() => {
      setIsGenerating(false);
      setReportReady(true);
    }, 1500);
  };

  const triggerPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:bg-white print:text-black">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-4 gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Mission Telemetry Reports
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            GENERATE DETAILED SCIENTIFIC AUDIT SUMMARIES & MODEL ACCURACY STATISTICS
          </p>
        </div>
      </div>

      {/* Model Performance Scorecard Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4 print:gap-2">
        <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-4 font-mono print:bg-white print:border-slate-300">
          <span className="text-[9px] text-slate-500 font-bold uppercase print:text-slate-500">Model F1-Score</span>
          <p className="text-2xl font-extrabold text-blue-400 mt-1 print:text-blue-700">96.8%</p>
          <span className="text-[9.5px] text-emerald-400 flex items-center gap-1 mt-1 font-sans">
            <TrendingUp className="h-3.5 w-3.5" />
            +0.4% this cycle
          </span>
        </div>
        <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-4 font-mono print:bg-white print:border-slate-300">
          <span className="text-[9px] text-slate-500 font-bold uppercase print:text-slate-500">Forecasting Precision</span>
          <p className="text-2xl font-extrabold text-emerald-400 mt-1 print:text-emerald-700">95.4%</p>
          <span className="text-[9.5px] text-slate-400 flex items-center gap-1 mt-1 font-sans">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            Within target bounds
          </span>
        </div>
        <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-4 font-mono print:bg-white print:border-slate-300">
          <span className="text-[9px] text-slate-500 font-bold uppercase print:text-slate-500">False Alarm Rate</span>
          <p className="text-2xl font-extrabold text-rose-400 mt-1 print:text-rose-700">1.2%</p>
          <span className="text-[9.5px] text-emerald-400 flex items-center gap-1 mt-1 font-sans">
            -0.3% improvement
          </span>
        </div>
        <div className="bg-[#1E293B] border border-slate-800 rounded-xl p-4 font-mono print:bg-white print:border-slate-300">
          <span className="text-[9px] text-slate-500 font-bold uppercase print:text-slate-500">Data Feed Uptime</span>
          <p className="text-2xl font-extrabold text-white mt-1 print:text-slate-900">99.98%</p>
          <span className="text-[9.5px] text-slate-400 flex items-center gap-1 mt-1 font-sans">
            NOAA L1 satellite
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Report Parameter Form */}
        <div className="lg:col-span-1 bg-[#1E293B] border border-slate-800 rounded-2xl p-5 h-fit print:hidden">
          <h2 className="text-sm font-bold text-white uppercase font-mono mb-4 flex items-center gap-2 border-b border-slate-800 pb-3">
            <FileText className="h-4.5 w-4.5 text-blue-400" />
            Report Builder
          </h2>

          <form onSubmit={handleGenerateReport} className="space-y-4 text-xs font-mono">
            <div className="space-y-1.5">
              <label className="text-slate-400 font-bold uppercase">Report Category</label>
              <select 
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500/50"
              >
                <option value="DAILY">DAILY BRIEF SUMMARY</option>
                <option value="WEEKLY">WEEKLY GEOMAGNETIC OUTLOOK</option>
                <option value="CYCLE">SOLAR ACTIVE CYCLE AUDIT</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-400 font-bold uppercase">Output Layout Format</label>
              <select 
                value={selectedFormat}
                onChange={(e) => setSelectedFormat(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 text-slate-300 focus:outline-none focus:border-blue-500/50"
              >
                <option value="PDF">PDF FORMAT (.pdf)</option>
                <option value="PRINT">PRINT CONSOLE FORMAT (.html)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-400 font-bold uppercase">Data Span (Prior)</label>
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl px-3 py-2 text-slate-400">
                LATEST 30 DATA RECORDS
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wider uppercase transition-colors duration-200 border border-blue-500/35 hover:shadow-[0_0_15px_rgba(59,130,246,0.4)] disabled:opacity-50 disabled:hover:shadow-none"
            >
              {isGenerating ? 'GENERATING REPORT...' : 'COMPILE TELEMETRY'}
            </button>
          </form>
        </div>

        {/* Live Threat Distribution Analytics (Right/Center Column) */}
        <div className="lg:col-span-2 bg-[#1E293B] border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-6 print:bg-white print:border-slate-300 print:text-black">
          <div className="flex-1 space-y-4">
            <div>
              <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-semibold print:text-slate-500">
                Threat Classification Share
              </span>
              <h3 className="text-base font-bold text-white font-sans print:text-slate-900">
                Risk Categorization (30 Days)
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans print:text-slate-700">
              Summarizes the distribution of warning levels across previous prediction cycles. Highly valuable for evaluating the overall ambient radiation level of the sun facing earth.
            </p>

            <div className="space-y-2 font-mono text-[10px]">
              {threatDistribution.map((item, index) => (
                <div key={index} className="flex items-center justify-between border-b border-slate-800/50 pb-1.5 print:border-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }}></span>
                    <span className="text-slate-400 print:text-slate-600">{item.name}</span>
                  </div>
                  <span className="text-slate-300 font-bold print:text-slate-900">{item.value} Forecasts</span>
                </div>
              ))}
            </div>
          </div>

          <div className="w-56 h-56 shrink-0 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={threatDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {threatDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E293B', borderColor: '#475569', fontSize: '10px', fontFamily: 'monospace' }} 
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <span className="text-2xl font-extrabold text-white font-mono print:text-slate-900">30</span>
              <p className="text-[9px] text-slate-500 font-mono tracking-widest uppercase font-semibold">CYCLES</p>
            </div>
          </div>
        </div>
      </div>

      {/* Generated Report Output Sheet */}
      {reportReady && (
        <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 lg:p-8 space-y-6 transition-all duration-300 animate-fadeIn print:border-none print:p-0 print:m-0 print:bg-white print:text-black">
          {/* Action buttons (Print) */}
          <div className="flex justify-between items-center border-b border-slate-800 pb-4 print:hidden">
            <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider flex items-center gap-2">
              <CheckCircle className="h-4.5 w-4.5 text-emerald-500" />
              Generated telemetry report is ready
            </h3>
            <button 
              onClick={triggerPrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 hover:text-blue-300 border border-blue-500/25 text-xs font-mono font-bold transition-all duration-200"
            >
              <Printer className="h-4 w-4" />
              <span>PRINT REPORT</span>
            </button>
          </div>

          {/* Report Paper Content */}
          <div className="space-y-6 font-mono text-xs max-w-4xl mx-auto border border-slate-800 bg-[#0F172A]/40 p-6 lg:p-10 rounded-xl print:border-none print:p-0 print:bg-white print:text-black">
            {/* Header info */}
            <div className="flex justify-between items-start border-b border-slate-800 pb-5 print:border-black">
              <div>
                <h2 className="text-base font-extrabold text-white tracking-widest print:text-black">SPACEGUARD AI TELEMETRY</h2>
                <p className="text-[10px] text-slate-500 uppercase mt-1 print:text-slate-600">Secure automated spacecraft shielding forecast</p>
              </div>
              <div className="text-right text-[10px] text-slate-400 print:text-slate-600">
                <p>REPORT ID: SG-REP-{Math.floor(100000 + Math.random() * 900000)}</p>
                <p>GENERATION DATE: {new Date().toISOString().split('T')[0]} / {new Date().toISOString().split('T')[1].split('.')[0]} UTC</p>
              </div>
            </div>

            {/* Config & status summaries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4 border-b border-slate-800/60 print:border-black/30">
              <div className="space-y-2">
                <h4 className="font-bold text-slate-400 border-b border-slate-800/40 pb-1 uppercase print:text-slate-800">1. Current Conditions Summary</h4>
                <p className="text-[11px] text-slate-300 leading-relaxed print:text-slate-800">
                  Solar Activity status index registered at <strong className="text-white print:text-black">{profile.currentStatusText}</strong>. Active profile set to: <strong className="text-blue-400 print:text-blue-700">{profile.name}</strong>. NOAA satellite telemetry stream operates at <strong className="text-white print:text-black">{profile.noaaStatus}</strong>.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-slate-400 border-b border-slate-800/40 pb-1 uppercase print:text-slate-800">2. Active Sensors Matrix</h4>
                <div className="space-y-1 text-[10.5px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">X-RAY FLUX LEVEL:</span>
                    <span className="text-slate-300 font-bold print:text-slate-800">{profile.weather.xrayFlux.value} ({profile.weather.xrayFlux.status})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PROTON RADIATION EVENT:</span>
                    <span className="text-slate-300 font-bold print:text-slate-800">{profile.weather.protonFlux.value} ({profile.weather.protonFlux.status})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">GEOMAGNETIC Kp INDEX:</span>
                    <span className="text-slate-300 font-bold print:text-slate-800">Kp {profile.weather.kpIndex.value} ({profile.weather.kpIndex.status})</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">IMF FIELD Bz:</span>
                    <span className="text-slate-300 font-bold print:text-slate-800">{profile.weather.solarWindBz.value} ({profile.weather.solarWindBz.status})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ML Prediction Analysis */}
            <div className="space-y-2 pb-2">
              <h4 className="font-bold text-slate-400 border-b border-slate-800/40 pb-1 uppercase print:text-slate-800">3. AI Threat Projection Details</h4>
              <p className="text-[11px] text-slate-300 leading-relaxed print:text-slate-800">
                Model calculations predict <strong className="text-rose-400 font-extrabold print:text-rose-700">{profile.prediction.riskLevel} RISK</strong> conditions for Earth's orbital satellite array. Predictive model reports confidence scores of <strong className="text-blue-400 print:text-blue-700">{profile.prediction.confidence}%</strong>.
              </p>
              <div className="bg-slate-900/60 p-4 border border-slate-800 rounded-lg print:border-black print:bg-white print:text-black mt-2">
                <p className="text-slate-400 font-bold text-[10px] mb-1 print:text-slate-800">MODEL REASONING:</p>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans print:text-slate-900">{profile.prediction.reason}</p>
                
                <p className="text-slate-400 font-bold text-[10px] mt-3.5 mb-1 print:text-slate-800">OPERATOR SHIELD ACTION RECOMMENDATION:</p>
                <p className="text-[11px] text-slate-300 leading-relaxed font-mono print:text-slate-900">{profile.prediction.recommendation}</p>
              </div>
            </div>

            {/* Footer stamp */}
            <div className="flex justify-between text-[10px] text-slate-500 border-t border-slate-800/60 pt-5 print:border-black print:text-black">
              <span>SECURITY CERTIFICATION: AUTH_OK_SHA-256</span>
              <span>SPACEGUARD MISSION CONTROLLER SIGNATURE: ____________________</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WeatherReportsView;
