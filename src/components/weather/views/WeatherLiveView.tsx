'use client';

import React from 'react';
import { useSpaceWeather } from '../../../context/SpaceWeatherContext';
import { getPrediction, PredictionParams, PredictionResult } from '../../../lib/weather-api';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Sun, Wind, Activity, Orbit, BrainCircuit, Gauge, Loader2, Send, ShieldAlert } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';

export const WeatherLiveView = () => {
  const { profile } = useSpaceWeather();
  const [manualWeather, setManualWeather] = React.useState<Required<PredictionParams>>({
    density: '5.0',
    speed: '420',
    temperature: '120000',
    xray_flux: '0.00000012',
    proton_flux: '0.8',
    proton_lag1: '0.7',
    proton_lag2: '0.6',
    proton_roll3: '0.7',
    proton_roll7: '0.65',
    xray_lag1: '0.00000010',
    xray_lag2: '0.00000008',
    xray_roll3: '0.00000010',
    xray_roll7: '0.00000009',
    kp_index: '2.0',
    kp_lag1: '2.0',
    kp_lag2: '1.7',
    kp_roll3: '1.9',
    bz: '1.0',
    bz_lag1: '1.2'
  });
  const [manualPrediction, setManualPrediction] = React.useState<PredictionResult | null>(null);
  const [manualLoading, setManualLoading] = React.useState(false);
  const [manualError, setManualError] = React.useState('');
  const [validationErrors, setValidationErrors] = React.useState<Partial<Record<keyof PredictionParams, string>>>({});

  // Helper to get status color classes
  const getStatusColor = (stat: string) => {
    switch (stat?.toLowerCase()) {
      case 'nominal':
        return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
      case 'warning':
        return 'text-amber-400 border-amber-500/20 bg-amber-500/10';
      case 'critical':
        return 'text-rose-400 border-rose-500/20 bg-rose-500/10';
      default:
        return 'text-slate-400 border-slate-700 bg-slate-800/50';
    }
  };

  // Generate mock real-time solar wind speed variation data for the last 12 hours
  const generateWindSpeedHistory = () => {
    const data: Array<{ time: string; speed: number; density: number }> = [];
    const baseSpeed = parseInt(profile.weather.windSpeed) || 400;
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 60 * 60 * 1000);
      const timeString = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const randomVariance = (Math.random() - 0.5) * 35;
      data.push({
        time: timeString,
        speed: Math.round(baseSpeed + randomVariance),
        density: Math.round((5 + (Math.random() - 0.5) * 2) * 10) / 10
      });
    }
    return data;
  };

  const windHistoryData = generateWindSpeedHistory();

  const riskTone = (riskLevel?: string) => {
    switch (riskLevel?.toUpperCase()) {
      case 'CRITICAL':
        return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
      case 'HIGH':
        return 'text-orange-400 border-orange-500/30 bg-orange-500/10';
      case 'MEDIUM':
        return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      default:
        return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
    }
  };

  const aiSuggestionsForRisk = (riskLevel?: string) => {
    switch (riskLevel?.toUpperCase()) {
      case 'CRITICAL':
        return [
          'Place spacecraft in storm-safe mode and defer all non-essential maneuvers.',
          'Increase tracking cadence for active satellites and verify command uplink availability.',
          'Protect payloads and radiation-sensitive systems until proton and x-ray levels recover.'
        ];
      case 'HIGH':
        return [
          'Prepare safe-mode procedures for exposed spacecraft and review maneuver windows.',
          'Monitor proton flux, x-ray flux, and solar wind speed at shortened intervals.',
          'Delay sensitive calibration, deployment, or high-risk communication operations.'
        ];
      case 'MEDIUM':
        return [
          'Continue enhanced monitoring and keep operations teams aware of changing conditions.',
          'Avoid scheduling optional precision maneuvers during the disturbance window.',
          'Validate recent telemetry for drag-related orbit changes in low Earth orbit assets.'
        ];
      default:
        return [
          'Maintain routine monitoring of solar and geomagnetic telemetry.',
          'Keep automated alerts enabled in case proton flux or solar wind speed rises.',
          'Proceed with nominal operations while preserving normal contingency readiness.'
        ];
    }
  };

  const inputRanges: Partial<Record<keyof PredictionParams, { min: number; max: number; hint: string }>> = {
    density: { min: 0, max: 200, hint: '0 to 200 p/cm3' },
    speed: { min: 250, max: 1200, hint: '250 to 1200 km/s' },
    temperature: { min: 1000, max: 5000000, hint: '1,000 to 5,000,000 K' },
    xray_flux: { min: 1e-10, max: 1e-2, hint: '1e-10 to 1e-2 W/m2' },
    proton_flux: { min: 0, max: 100000, hint: '0 to 100,000 pfu' },
    proton_lag1: { min: 0, max: 100000, hint: '0 to 100,000 pfu' },
    proton_lag2: { min: 0, max: 100000, hint: '0 to 100,000 pfu' },
    proton_roll3: { min: 0, max: 100000, hint: '0 to 100,000 pfu' },
    proton_roll7: { min: 0, max: 100000, hint: '0 to 100,000 pfu' },
    xray_lag1: { min: 1e-10, max: 1e-2, hint: '1e-10 to 1e-2 W/m2' },
    xray_lag2: { min: 1e-10, max: 1e-2, hint: '1e-10 to 1e-2 W/m2' },
    xray_roll3: { min: 1e-10, max: 1e-2, hint: '1e-10 to 1e-2 W/m2' },
    xray_roll7: { min: 1e-10, max: 1e-2, hint: '1e-10 to 1e-2 W/m2' },
    kp_index: { min: 0, max: 9, hint: '0 to 9' },
    kp_lag1: { min: 0, max: 9, hint: '0 to 9' },
    kp_lag2: { min: 0, max: 9, hint: '0 to 9' },
    kp_roll3: { min: 0, max: 9, hint: '0 to 9' },
    bz: { min: -50, max: 50, hint: '-50 to 50 nT' },
    bz_lag1: { min: -50, max: 50, hint: '-50 to 50 nT' }
  };

  const currentInputFields: Array<[keyof PredictionParams, string, string]> = [
    ['density', 'Density', inputRanges.density?.hint || 'p/cm3'],
    ['speed', 'Solar wind', inputRanges.speed?.hint || 'km/s'],
    ['temperature', 'Temperature', inputRanges.temperature?.hint || 'K'],
    ['xray_flux', 'X-ray flux', inputRanges.xray_flux?.hint || 'W/m2'],
    ['proton_flux', 'Proton flux', inputRanges.proton_flux?.hint || 'pfu'],
    ['kp_index', 'Kp index', inputRanges.kp_index?.hint || '0-9'],
    ['bz', 'Bz field', inputRanges.bz?.hint || 'nT']
  ];

  const historyInputFields: Array<[keyof PredictionParams, string, string]> = [
    ['proton_lag1', 'Proton yesterday', inputRanges.proton_lag1?.hint || 'pfu'],
    ['proton_lag2', 'Proton 2 days ago', inputRanges.proton_lag2?.hint || 'pfu'],
    ['proton_roll3', 'Proton 3-day avg', inputRanges.proton_roll3?.hint || 'pfu'],
    ['proton_roll7', 'Proton 7-day avg', inputRanges.proton_roll7?.hint || 'pfu'],
    ['xray_lag1', 'X-ray yesterday', inputRanges.xray_lag1?.hint || 'W/m2'],
    ['xray_lag2', 'X-ray 2 days ago', inputRanges.xray_lag2?.hint || 'W/m2'],
    ['xray_roll3', 'X-ray 3-day avg', inputRanges.xray_roll3?.hint || 'W/m2'],
    ['xray_roll7', 'X-ray 7-day avg', inputRanges.xray_roll7?.hint || 'W/m2'],
    ['kp_lag1', 'Kp yesterday', inputRanges.kp_lag1?.hint || '0-9'],
    ['kp_lag2', 'Kp 2 days ago', inputRanges.kp_lag2?.hint || '0-9'],
    ['kp_roll3', 'Kp 3-day avg', inputRanges.kp_roll3?.hint || '0-9'],
    ['bz_lag1', 'Bz previous', inputRanges.bz_lag1?.hint || 'nT']
  ];

  const handleManualWeatherChange = (field: keyof PredictionParams, value: string) => {
    setManualWeather((current) => ({ ...current, [field]: value }));
    setValidationErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateManualWeather = () => {
    const errors: Partial<Record<keyof PredictionParams, string>> = {};

    for (const field of [...currentInputFields, ...historyInputFields].map(([key]) => key)) {
      const value = manualWeather[field];
      const range = inputRanges[field];
      const isRequired = currentInputFields.some(([key]) => key === field);

      if (value === '' || value === undefined || value === null) {
        if (isRequired) {
          errors[field] = 'Required';
        }
        continue;
      }

      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) {
        errors[field] = 'Enter a valid number';
      } else if (range && (numericValue < range.min || numericValue > range.max)) {
        errors[field] = `Use ${range.hint}`;
      }
    }

    return errors;
  };

  const handleManualPrediction = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setManualError('');

    const errors = validateManualWeather();
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      setManualPrediction(null);
      setManualError('Fix the highlighted weather inputs before running the model.');
      return;
    }

    setManualLoading(true);

    try {
      const response = await getPrediction(manualWeather);
      setManualPrediction(response.data);
    } catch (error) {
      console.error('Manual weather prediction failed:', error);
      setManualError('Unable to generate a manual prediction right now. Check that the backend is running.');
    } finally {
      setManualLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-border pb-4 gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Solar Telemetry Readings
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 animate-ping"></span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            DETAILED SPACE WEATHER METRICS & MAGNETOSPHERE STATE SENSORS
          </p>
        </div>
      </div>

      {/* Primary Weather Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Core Solar Indices Details */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Detailed Readout Panels */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6">
            <h2 className="text-base font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-800 pb-3 font-mono">
              <Sun className="h-5 w-5 text-amber-500" />
              SENSOR ARRAY METRIC SHEETS
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* X-Ray Sensor Panel */}
              <div className="bg-[#0F172A]/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono font-bold tracking-widest">SENSOR ID: GOES-16/XRAY</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${getStatusColor(profile.weather.xrayFlux.status)}`}>
                    {profile.weather.xrayFlux.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-slate-400 text-xs">X-Ray Flare Level</p>
                  <p className="text-2xl font-mono font-extrabold text-white">{profile.weather.xrayFlux.value}</p>
                </div>
                <div className="text-[11px] text-slate-400 font-sans border-t border-slate-800/80 pt-2 leading-relaxed">
                  Monitors solar solar flares. Classes range from A (quiet) up to X (extreme). X-class flares can trigger planet-wide radio blackouts.
                </div>
              </div>

              {/* Proton Sensor Panel */}
              <div className="bg-[#0F172A]/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono font-bold tracking-widest">SENSOR ID: ACE/PROTON</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${getStatusColor(profile.weather.protonFlux.status)}`}>
                    {profile.weather.protonFlux.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-slate-400 text-xs">Solar Proton Flux</p>
                  <p className="text-2xl font-mono font-extrabold text-white">{profile.weather.protonFlux.value}</p>
                </div>
                <div className="text-[11px] text-slate-400 font-sans border-t border-slate-800/80 pt-2 leading-relaxed">
                  Measures high-energy solar radiation. Levels exceeding 10 pfu represent Radiation Storms (S1-S5) threatening satellites and polar aviation.
                </div>
              </div>

              {/* Kp Magnetometer Panel */}
              <div className="bg-[#0F172A]/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono font-bold tracking-widest">SENSOR ID: GFZ/KP-INDEX</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${getStatusColor(profile.weather.kpIndex.status)}`}>
                    {profile.weather.kpIndex.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-slate-400 text-xs">Global Geomagnetic Index</p>
                  <p className="text-2xl font-mono font-extrabold text-white">Kp {profile.weather.kpIndex.value}</p>
                </div>
                <div className="text-[11px] text-slate-400 font-sans border-t border-slate-800/80 pt-2 leading-relaxed">
                  Calculates geomagnetic disturbance. 0 to 9 scale. Levels &ge; 5 indicate geomagnetic storms (G1-G5), with potential power grid implications.
                </div>
              </div>

              {/* Interplanetary Magnetic Field Panel */}
              <div className="bg-[#0F172A]/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-mono font-bold tracking-widest">SENSOR ID: DSCOVR/IMF</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${getStatusColor(profile.weather.solarWindBz.status)}`}>
                    {profile.weather.solarWindBz.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <p className="text-slate-400 text-xs">IMF Orientation (Bz)</p>
                  <p className="text-2xl font-mono font-extrabold text-white">{profile.weather.solarWindBz.value}</p>
                </div>
                <div className="text-[11px] text-slate-400 font-sans border-t border-slate-800/80 pt-2 leading-relaxed">
                  Magnetic Bz coordinates. Negative values (pointing South) connect directly with Earth's magnetosphere, allowing solar wind particles to enter.
                </div>
              </div>
            </div>
          </div>

          {/* Recharts Wind Speed Graph */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5">
            <div className="flex justify-between items-center mb-6">
              <div>
                <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase font-semibold">COSMIC FLUID MOTION</span>
                <h3 className="text-base font-bold text-white font-sans flex items-center gap-2">
                  <Wind className="h-4.5 w-4.5 text-blue-400 animate-pulse" />
                  Solar Wind Speed Stream (12h)
                </h3>
              </div>
              <div className="bg-[#0F172A] border border-slate-800 px-3 py-1 rounded text-xs font-mono text-slate-300">
                CURRENT Speed: <strong className="text-blue-400">{profile.weather.windSpeed}</strong>
              </div>
            </div>

            <div className="h-64 w-full font-mono text-[9px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={windHistoryData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                  <XAxis dataKey="time" stroke="#64748B" />
                  <YAxis domain={['auto', 'auto']} stroke="#64748B" unit=" km/s" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', borderColor: '#475569', color: '#fff', fontFamily: 'monospace', fontSize: '10px' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="speed" 
                    stroke="#3B82F6" 
                    strokeWidth={2.5} 
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* Sidebar Auxiliary Sensors (Right Column) */}
        <div className="space-y-6">
          {/* Planet Magnetosphere Simulation State */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
              <Orbit className="h-4.5 w-4.5 text-indigo-400" />
              MAGNETOSPHERE SHIELD DIAL
            </h3>

            <div className="bg-[#0F172A] rounded-xl border border-slate-800/80 p-4 space-y-4 text-center">
              <span className="text-[10px] text-slate-500 font-mono tracking-widest">DEFLECTION FIELD STRENGTH</span>
              
              <div className="flex flex-col items-center">
                <span className="text-4xl font-extrabold font-mono text-white mt-1">
                  {profile.weather.magneticFieldStrength}
                </span>
                <span className="text-[10px] text-indigo-400 font-mono font-semibold tracking-wider mt-1">IMF Bt FIELD VALUE</span>
              </div>
              
              <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-850 p-[1px]">
                <div 
                  className={`h-full rounded-full transition-all duration-700 ${
                    parseFloat(profile.weather.magneticFieldStrength) > 30 ? 'bg-rose-500' :
                    parseFloat(profile.weather.magneticFieldStrength) > 15 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, (parseFloat(profile.weather.magneticFieldStrength) / 50) * 100)}%` }}
                ></div>
              </div>
            </div>

            <div className="space-y-3 font-mono text-[11px]">
              <div className="flex justify-between border-b border-slate-800/50 pb-2">
                <span className="text-slate-500">SUNSPOT VALUE (Ri):</span>
                <span className="text-slate-300 font-bold">{profile.weather.sunspots} Spots</span>
              </div>
              <div className="flex justify-between border-b border-slate-800/50 pb-2">
                <span className="text-slate-500">SOLAR FLUID DENSITY:</span>
                <span className="text-slate-300 font-bold">{profile.weather.density}</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="text-slate-500">PROTON TEMP:</span>
                <span className="text-slate-300 font-bold">{profile.weather.temperature}</span>
              </div>
            </div>
          </div>

          {/* Model Status Metrics */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase font-mono flex items-center gap-2 border-b border-slate-800 pb-3">
              <Activity className="h-4.5 w-4.5 text-blue-400" />
              NOAA FEED METADATA
            </h3>

            <div className="space-y-3.5 text-xs">
              <div className="p-3 bg-[#0F172A] rounded-xl border border-slate-850 flex flex-col gap-1.5">
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-slate-500">SPACEGUARD SAT ID</span>
                  <span className="text-blue-400 font-semibold">NOAA-DSCOVR</span>
                </div>
                <div className="w-full bg-slate-900/60 rounded h-1"></div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-slate-500">SAT STATUS</span>
                  <span className="text-emerald-400 font-semibold">TELEMETRY_OK</span>
                </div>
              </div>

              <div className="p-3 bg-[#0F172A] rounded-xl border border-slate-850 flex flex-col gap-1.5">
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-slate-500">ORBIT HEIGHT</span>
                  <span className="text-blue-400 font-semibold">1,500,000 km (L1)</span>
                </div>
                <div className="w-full bg-slate-900/60 rounded h-1"></div>
                <div className="flex justify-between font-mono text-[10px]">
                  <span className="text-slate-500">LATENCY INDEX</span>
                  <span className="text-emerald-400 font-semibold">1.42s (REAL-TIME)</span>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Manual Model Prediction Section */}
      <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-5 md:p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white uppercase font-mono flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-cyan-400" />
              Manual Weather Risk Prediction
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter custom space weather values and run them through the trained next-day risk model.
            </p>
          </div>
          {manualPrediction && (
            <span className={`w-fit rounded border px-3 py-1 text-xs font-bold font-mono ${riskTone(manualPrediction.risk_level)}`}>
              {manualPrediction.risk_level.toUpperCase()} RISK
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
          <form onSubmit={handleManualPrediction} className="bg-[#0F172A]/70 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="space-y-5">
              <div className="space-y-3">
                <h3 className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest">Current Reading</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {currentInputFields.map(([field, label, unit]) => (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={`manual-${field}`} className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                        {label}
                      </Label>
                      <Input
                        id={`manual-${field}`}
                        type="number"
                        step="any"
                        min={inputRanges[field]?.min}
                        max={inputRanges[field]?.max}
                        value={manualWeather[field]}
                        onChange={(event) => handleManualWeatherChange(field, event.target.value)}
                        className={`bg-slate-950 text-slate-100 font-mono text-xs ${
                          validationErrors[field] ? 'border-rose-500 focus-visible:ring-rose-500' : 'border-slate-800'
                        }`}
                        required
                      />
                      <p className={`text-[10px] font-mono ${validationErrors[field] ? 'text-rose-300' : 'text-slate-600'}`}>
                        {validationErrors[field] || unit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-slate-800 pt-4">
                <h3 className="text-[10px] text-cyan-400 font-mono uppercase tracking-widest">Recent History Features</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {historyInputFields.map(([field, label, unit]) => (
                    <div key={field} className="space-y-2">
                      <Label htmlFor={`manual-${field}`} className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                        {label}
                      </Label>
                      <Input
                        id={`manual-${field}`}
                        type="number"
                        step="any"
                        min={inputRanges[field]?.min}
                        max={inputRanges[field]?.max}
                        value={manualWeather[field]}
                        onChange={(event) => handleManualWeatherChange(field, event.target.value)}
                        className={`bg-slate-950 text-slate-100 font-mono text-xs ${
                          validationErrors[field] ? 'border-rose-500 focus-visible:ring-rose-500' : 'border-slate-800'
                        }`}
                      />
                      <p className={`text-[10px] font-mono ${validationErrors[field] ? 'text-rose-300' : 'text-slate-600'}`}>
                        {validationErrors[field] || unit}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800 pt-4">
              <p className="text-[11px] text-slate-500 leading-relaxed">
                The submitted values are sent to the same ML prediction endpoint used by the live NOAA telemetry flow.
              </p>
              <Button type="submit" disabled={manualLoading} className="bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold">
                {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Predict Risk
              </Button>
            </div>
          </form>

          <div className="bg-[#0F172A]/70 border border-slate-800 rounded-xl p-4 min-h-[230px]">
            {manualError ? (
              <div className="h-full flex items-center text-sm text-rose-300">{manualError}</div>
            ) : manualPrediction ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Model Output</span>
                    <div className="mt-2 flex items-center gap-3">
                      <Gauge className="h-5 w-5 text-cyan-400" />
                      <span className="text-3xl font-extrabold text-white font-mono">
                        {Math.round(manualPrediction.risk_score)}%
                      </span>
                      <span className="text-xs text-slate-400">confidence</span>
                    </div>
                  </div>
                  <ShieldAlert className={`h-7 w-7 ${riskTone(manualPrediction.risk_level).split(' ')[0]}`} />
                </div>

                <p className="text-xs text-slate-300 leading-relaxed border-t border-slate-800 pt-3">
                  {manualPrediction.explanation}
                </p>

                {manualPrediction.class_probabilities && (
                  <div className="space-y-2 border-t border-slate-800 pt-3">
                    <h3 className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Class Probabilities</h3>
                    {Object.entries(manualPrediction.class_probabilities).map(([label, probability]) => (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className="text-slate-400">{label}</span>
                          <span className="text-slate-200">{probability.toFixed(2)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-900 border border-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              label === 'HIGH' ? 'bg-orange-500' :
                              label === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, probability))}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2 border-t border-slate-800 pt-3">
                  <h3 className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">AI Suggestions</h3>
                  {aiSuggestionsForRisk(manualPrediction.risk_level).map((suggestion) => (
                    <div key={suggestion} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400"></span>
                      <span>{suggestion}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col justify-center gap-2 text-sm text-slate-400">
                <span className="font-mono text-xs text-slate-500 uppercase tracking-widest">Awaiting Manual Input</span>
                <p>Submit weather values to see model risk output and operational suggestions.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WeatherLiveView;
