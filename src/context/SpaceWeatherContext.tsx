'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getAiSuggestions, getCurrentSpaceWeather, getHistory, SpaceWeatherCurrentResponse, SpaceWeatherHistoryItem } from '../lib/weather-api';

interface SpaceWeatherContextType {
  profile: any;
  history: SpaceWeatherHistoryItem[];
  activeProfileId: string;
  changeProfile: (id: string) => void;
  loading: boolean;
  allProfiles: any[];
}

const SpaceWeatherContext = createContext<SpaceWeatherContextType | undefined>(undefined);

const DEFAULT_PROFILE = {
  id: 'MODEL_DATA',
  name: 'Processed Space Weather Dataset',
  description: 'Latest record from the backend processed telemetry dataset.',
  status: 'NORMAL',
  tomorrowPrediction: 'Loading...',
  noaaStatus: 'CONNECTING',
  databaseStatus: 'SYNCING',
  currentStatusText: 'Loading model data',
  prediction: {
    riskLevel: 'LOW',
    confidence: 0,
    reason: 'Waiting for the backend model response.',
    recommendation: 'Maintain monitoring while telemetry loads.'
  },
  weather: {
    xrayFlux: { value: '--', status: 'nominal', raw: 0 },
    protonFlux: { value: '--', status: 'nominal', raw: 0 },
    kpIndex: { value: '--', status: 'nominal', raw: 0 },
    solarWindBz: { value: '--', status: 'nominal', raw: 0 },
    windSpeed: '--',
    density: '--',
    temperature: '--',
    sunspots: 0,
    magneticFieldStrength: '--'
  },
  alerts: []
};

const toProfile = (data: SpaceWeatherCurrentResponse, recommendation?: string) => {
  const riskLevel = data.prediction.risk_level?.toUpperCase() || 'LOW';

  return {
    ...DEFAULT_PROFILE,
    id: 'MODEL_DATA',
    name: data.name || DEFAULT_PROFILE.name,
    status: data.status || DEFAULT_PROFILE.status,
    tomorrowPrediction: data.tomorrowPrediction || DEFAULT_PROFILE.tomorrowPrediction,
    noaaStatus: data.noaaStatus || 'ONLINE',
    databaseStatus: data.databaseStatus || 'CONNECTED',
    currentStatusText: data.currentStatusText || `${riskLevel} Risk Conditions`,
    prediction: {
      riskLevel,
      confidence: data.prediction.risk_score ?? 0,
      reason: data.prediction.explanation || DEFAULT_PROFILE.prediction.reason,
      recommendation: recommendation || 'Live Gemini operational guidance is unavailable.'
    },
    weather: {
      ...DEFAULT_PROFILE.weather,
      ...data.weather
    },
    alerts: data.alerts || []
  };
};

export const SpaceWeatherProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfile] = useState<any>(DEFAULT_PROFILE);
  const [history, setHistory] = useState<SpaceWeatherHistoryItem[]>([]);
  const [activeProfileId, setActiveProfileId] = useState('MODEL_DATA');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchModelData = async () => {
      setLoading(true);
      try {
        const [currentResponse, historyResponse] = await Promise.all([
          getCurrentSpaceWeather(),
          getHistory()
        ]);

        if (!isMounted) return;

        const liveWeather = currentResponse.data.weather;
        const suggestionsResponse = await getAiSuggestions(
          {
            density: liveWeather.density,
            speed: liveWeather.windSpeed,
            temperature: liveWeather.temperature,
            xray_flux: liveWeather.xrayFlux.raw,
            proton_flux: liveWeather.protonFlux.raw,
            kp_index: liveWeather.kpIndex.raw,
            bz: liveWeather.solarWindBz.raw,
          },
          currentResponse.data.prediction,
          'live',
        ).catch(() => null);

        if (!isMounted) return;
        setProfile(toProfile(currentResponse.data, suggestionsResponse?.data.suggestions.join(' ')));
        setHistory(historyResponse.data);
      } catch (err) {
        console.error('Error fetching model-backed space weather data:', err);
        if (isMounted) {
          setProfile({
            ...DEFAULT_PROFILE,
            status: 'CRITICAL',
            noaaStatus: 'OFFLINE',
            databaseStatus: 'DISCONNECTED',
            currentStatusText: 'Backend unavailable',
            prediction: {
              ...DEFAULT_PROFILE.prediction,
              reason: 'Unable to reach the FastAPI backend. Start the backend server to display model data.'
            }
          });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchModelData();
    // Keep the local prediction archive receiving fresh NOAA snapshots while
    // the dashboard is open. The backend degrades to cached data if NOAA is down.
    const refreshTimer = window.setInterval(fetchModelData, 15 * 60 * 1000);

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const changeProfile = (id: string) => {
    setActiveProfileId('MODEL_DATA');
  };

  return (
    <SpaceWeatherContext.Provider value={{
      profile,
      history,
      activeProfileId,
      changeProfile,
      loading,
      allProfiles: [DEFAULT_PROFILE]
    }}>
      {children}
    </SpaceWeatherContext.Provider>
  );
};

export const useSpaceWeather = () => {
  const context = useContext(SpaceWeatherContext);
  if (!context) {
    throw new Error('useSpaceWeather must be used within a SpaceWeatherProvider');
  }
  return context;
};
