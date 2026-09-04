import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000';

export interface PredictionParams {
  density?: number | string;
  speed?: number | string;
  temperature?: number | string;
  xray_flux?: number | string;
  proton_flux?: number | string;
  kp_index?: number | string;
  bz?: number | string;
}

export interface WeatherMetric {
  value: string;
  status: 'nominal' | 'warning' | 'critical';
  raw: number;
  time?: string;
  source?: string;
}

export interface SpaceWeatherPayload {
  xrayFlux: WeatherMetric;
  protonFlux: WeatherMetric;
  kpIndex: WeatherMetric;
  solarWindBz: WeatherMetric;
  windSpeed: string;
  density: string;
  temperature: string;
  sunspots: number;
  magneticFieldStrength: string;
}

export interface PredictionResult {
  risk_score: number;
  risk_level: string;
  explanation: string;
  class_probabilities?: Record<string, number>;
}

export interface SpaceWeatherCurrentResponse {
  date: string;
  name: string;
  status: string;
  tomorrowPrediction: string;
  noaaStatus: string;
  databaseStatus: string;
  currentStatusText: string;
  prediction: PredictionResult;
  weather: SpaceWeatherPayload;
  alerts: Array<{
    id: string;
    type: 'CRITICAL' | 'WARNING' | 'INFO';
    time: string;
    message: string;
  }>;
}

export interface SpaceWeatherHistoryItem {
  date: string;
  risk: number;
  riskLabel: string;
  confidence: number;
}

export const getPrediction = async (params?: PredictionParams) => {
  if (!params) {
    return {
      data: {
        risk_level: 'LOW',
        risk_score: 12.0,
        explanation: 'Solar activity is extremely quiet with no active sunspots.'
      } as PredictionResult
    };
  }

  try {
    const payload = {
      density: parseFloat(params.density as string) || 1.8,
      speed: parseFloat(params.speed as string) || 310.0,
      sw_speed: parseFloat(params.speed as string) || 310.0,
      temperature: parseFloat(params.temperature as string) || 144000.0,
      xray_flux: parseFloat(params.xray_flux as string) || 1.2e-8,
      proton_flux: parseFloat(params.proton_flux as string) || 0.22,
      kp_index: parseFloat(params.kp_index as string) || 2.0,
      bz: Number.isNaN(parseFloat(params.bz as string)) ? 1.0 : parseFloat(params.bz as string),
    };
    
    const response = await axios.post<PredictionResult>(`${API_BASE_URL}/predict`, payload);
    return response;
  } catch (error) {
    console.warn("FastAPI Prediction API failed. Falling back to local model.", error);
    
    const speed = parseFloat(params.speed as string) || 310.0;
    const proton = parseFloat(params.proton_flux as string) || 0.22;
    const xray = parseFloat(params.xray_flux as string) || 1.2e-8;
    
    let risk_level = 'LOW';
    let risk_score = 12.0;
    let explanation = 'Local analytical fallback active.';

    if (speed > 700 || proton > 100) {
      risk_level = 'CRITICAL';
      risk_score = 92.5;
      explanation = 'High wind velocity and solar proton events detected.';
    } else if (xray > 1e-4) {
      risk_level = 'HIGH';
      risk_score = 78.4;
      explanation = 'Major solar flare event registered.';
    } else if (speed > 500 || proton > 10) {
      risk_level = 'MEDIUM';
      risk_score = 45.2;
      explanation = 'Moderate solar wind disturbance.';
    }

    return {
      data: {
        risk_level,
        risk_score,
        explanation
      } as PredictionResult
    };
  }
};

export const getCurrentSpaceWeather = async () => {
  return await axios.get<SpaceWeatherCurrentResponse>(`${API_BASE_URL}/current`);
};

export const getLiveWeather = async () => {
  const response = await getCurrentSpaceWeather();
  return { data: response.data.weather };
};

export const getHistory = async () => {
  return await axios.get<SpaceWeatherHistoryItem[]>(`${API_BASE_URL}/history`);
};

export const getAlerts = async () => {
  return await axios.get<any[]>(`${API_BASE_URL}/alerts`);
};

const weatherApi = {
  getPrediction,
  getCurrentSpaceWeather,
  getLiveWeather,
  getHistory,
  getAlerts
};

export default weatherApi;
