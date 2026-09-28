'use client';
import { create } from 'zustand';

export type ViewKey = 
  | 'overview' 
  | 'satellites' 
  | 'analyze' 
  | 'analysis'
  | 'simulation' 
  | 'conjunctions'
  | 'history' 
  | 'docs'
  | 'weather-dashboard'
  | 'weather-live'
  | 'weather-history'
  | 'weather-reports'
  | 'weather-settings';

interface UIState {
  view: ViewKey;
  setView: (v: ViewKey) => void;
  selectedSatellite: {
    databaseId: string;
    catalogId: string;
    name: string;
  } | null;
  selectSatellite: (satellite: { id: string; name: string }) => void;
  clearSelectedSatellite: () => void;
  selectedConjunctionId: string | null;
  openConjunction: (id: string) => void;
  closeConjunction: () => void;
  simulationConjunctionId: string | null;
  openSimulation: (id: string) => void;
  closeSimulation: () => void;
  demoActive: boolean;
  demoStep: number;
  startDemo: () => void;
  endDemo: () => void;
}

export const useUI = create<UIState>((set) => ({
  view: 'overview',
  setView: (v) => set({ view: v }),
  selectedSatellite: null,
  selectSatellite: (satellite) => set({
    selectedSatellite: {
      databaseId: satellite.id,
      catalogId: satellite.id,
      name: satellite.name,
    },
  }),
  clearSelectedSatellite: () => set({ selectedSatellite: null }),
  selectedConjunctionId: null,
  openConjunction: (id) => set({ selectedConjunctionId: id }),
  closeConjunction: () => set({ selectedConjunctionId: null }),
  simulationConjunctionId: null,
  openSimulation: (id) => set({ simulationConjunctionId: id }),
  closeSimulation: () => set({ simulationConjunctionId: null }),
  demoActive: false,
  demoStep: 0,
  startDemo: () => set({ demoActive: true, view: 'overview' }),
  endDemo: () => set({ demoActive: false }),
}));
