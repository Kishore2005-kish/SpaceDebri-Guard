'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCurrentSpaceWeather, getHistory, SpaceWeatherCurrentResponse, SpaceWeatherHistoryItem } from '../lib/weather-api';

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

const recommendationForRisk = (riskLevel: string) => {
  switch (riskLevel?.toUpperCase()) {
    case 'CRITICAL':
      return 'Suspend non-essential satellite maneuvers and protect sensitive payloads until the storm risk drops.';
    case 'HIGH':
      return 'Increase satellite telemetry checks and prepare radiation mitigation procedures for exposed systems.';
    case 'MEDIUM':
      return 'Continue enhanced monitoring of solar wind, proton flux, and communications-sensitive operations.';
    default:
      return 'No operational actions required. Maintain routine monitoring of telemetry and geomagnetic indices.';
  }
};

const toProfile = (data: SpaceWeatherCurrentResponse) => {
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
      recommendation: recommendationForRisk(riskLevel)
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

        setProfile(toProfile(currentResponse.data));
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

    return () => {
      isMounted = false;
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
