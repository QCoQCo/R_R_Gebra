import { create } from 'zustand';

export interface Point {
  x: number;
  y: number;
}

interface GraphState {
  formula: string;
  xMin: number;
  xMax: number;
  step: number;
  points: Point[];
  loading: boolean;
  error: string | null;
  setFormula: (formula: string) => void;
  setRange: (xMin: number, xMax: number, step: number) => void;
  setPoints: (points: Point[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const defaultState = {
  formula: '',
  xMin: -10,
  xMax: 10,
  step: 0.1,
  points: [],
  loading: false,
  error: null,
};

export const useGraphStore = create<GraphState>((set) => ({
  ...defaultState,
  setFormula: (formula) => set({ formula, error: null }),
  setRange: (xMin, xMax, step) =>
    set({ xMin, xMax, step, error: null }),
  setPoints: (points) => set({ points, loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: loading ? null : undefined }),
  setError: (error) => set({ error, loading: false }),
  reset: () => set(defaultState),
}));
