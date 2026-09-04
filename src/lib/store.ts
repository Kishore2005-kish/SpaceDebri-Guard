'use client';
import { create } from 'zustand';

export type ViewKey = 
  | 'overview' 
  | 'satellites' 
  | 'analyze' 
  | 'simulation' 
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
  selectedConjunctionId: string | null;
  openConjunction: (id: string) => void;
  closeConjunction: () => void;
  simulationConjunctionId: string | null;
  openSimulation: (id: string) => void;
  closeSimulation: () => void;
  demoActive: boolean;
  startDemo: () => void;
  endDemo: () => void;
}

export const useUI = create<UIState>((set) => ({
  view: 'overview',
  setView: (v) => set({ view: v }),
  selectedConjunctionId: null,
  openConjunction: (id) => set({ selectedConjunctionId: id }),
  closeConjunction: () => set({ selectedConjunctionId: null }),
  simulationConjunctionId: null,
  openSimulation: (id) => set({ simulationConjunctionId: id }),
  closeSimulation: () => set({ simulationConjunctionId: null }),
  demoActive: false,
  startDemo: () => set({ demoActive: true, view: 'overview' }),
  endDemo: () => set({ demoActive: false }),
}));
