import { create } from 'zustand';
import { MAX_CACHE_ENTRIES } from '../constants';

export interface Point {
  x: number;
  y: number;
}

/** 뷰포트 자동: 줌/팬한 구간만 계산. 수동: 사용자가 x_min, x_max 입력 */
export type ViewportMode = 'auto' | 'manual';

/** 수식 타입: y=f(x) vs f(x,y)=0 */
export type FormulaType = 'explicit' | 'implicit';

/** x 범위 상한 (|xMax - xMin| ≤ 2e6). 극단적 줌 아웃 시 포인트 폭증 방지 */
export const X_RANGE_LIMIT = 2e6;

export interface ViewportBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** 캐시 키: (formula, xMin, xMax, step) → points */
export type GraphCacheKey = string;

/** 암시적 캐시 키: (formula, xMin, xMax, yMin, yMax, gridSize) → curves */
export type ImplicitCacheKey = string;

function makeCacheKey(formula: string, xMin: number, xMax: number, step: number): GraphCacheKey {
  return `${formula}|${xMin}|${xMax}|${step}`;
}

function makeImplicitCacheKey(
  formula: string,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  gridSize: number
): ImplicitCacheKey {
  return `${formula}|${xMin}|${xMax}|${yMin}|${yMax}|${gridSize}`;
}

interface GraphState {
  formula: string;
  formulaType: FormulaType;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  step: number;
  points: Point[];
  implicitCurves: Point[][];
  loading: boolean;
  error: string | null;
  viewportMode: ViewportMode;
  viewportBounds: ViewportBounds | null;
  graphCache: Map<GraphCacheKey, Point[]>;
  implicitCache: Map<ImplicitCacheKey, Point[][]>;
  setFormula: (formula: string) => void;
  setFormulaType: (type: FormulaType) => void;
  setRange: (xMin: number, xMax: number, step: number) => void;
  setRange2D: (xMin: number, xMax: number, yMin: number, yMax: number, step: number) => void;
  setPoints: (points: Point[]) => void;
  setImplicitCurves: (curves: Point[][]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setViewportMode: (mode: ViewportMode) => void;
  setViewportBounds: (bounds: ViewportBounds | null) => void;
  getCachedPoints: (formula: string, xMin: number, xMax: number, step: number) => Point[] | null;
  setCachedPoints: (formula: string, xMin: number, xMax: number, step: number, points: Point[]) => void;
  getCachedImplicit: (
    formula: string,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    gridSize: number
  ) => Point[][] | null;
  setCachedImplicit: (
    formula: string,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    gridSize: number,
    curves: Point[][]
  ) => void;
  invalidateCache: () => void;
  reset: () => void;
}

const defaultState = {
  formula: '',
  formulaType: 'explicit' as FormulaType,
  xMin: -10,
  xMax: 10,
  yMin: -10,
  yMax: 10,
  step: 0.1,
  points: [] as Point[],
  implicitCurves: [] as Point[][],
  loading: false,
  error: null as string | null,
  viewportMode: 'auto' as ViewportMode,
  viewportBounds: null as ViewportBounds | null,
  graphCache: new Map<GraphCacheKey, Point[]>(),
  implicitCache: new Map<ImplicitCacheKey, Point[][]>(),
};

export const useGraphStore = create<GraphState>((set, get) => ({
  ...defaultState,
  setFormula: (formula) => set({ formula, error: null }),
  setFormulaType: (formulaType) => set({ formulaType }),
  setRange: (xMin, xMax, step) =>
    set({ xMin, xMax, step, error: null }),
  setRange2D: (xMin, xMax, yMin, yMax, step) =>
    set({ xMin, xMax, yMin, yMax, step, error: null }),
  setPoints: (points) => set({ points, implicitCurves: [], loading: false, error: null }),
  setImplicitCurves: (implicitCurves) => set({ implicitCurves, points: [], loading: false, error: null }),
  setLoading: (loading) => set({ loading, error: loading ? null : undefined }),
  setError: (error) => set({ error, loading: false }),
  setViewportMode: (mode) => set({ viewportMode: mode }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  getCachedPoints: (formula, xMin, xMax, step) => {
    const key = makeCacheKey(formula, xMin, xMax, step);
    return get().graphCache.get(key) ?? null;
  },
  setCachedPoints: (formula, xMin, xMax, step, points) => {
    const key = makeCacheKey(formula, xMin, xMax, step);
    set((s) => {
      const next = new Map(s.graphCache).set(key, points);
      if (next.size > MAX_CACHE_ENTRIES) {
        const firstKey = next.keys().next().value;
        if (firstKey !== undefined) next.delete(firstKey);
      }
      return { graphCache: next };
    });
  },
  getCachedImplicit: (formula, xMin, xMax, yMin, yMax, gridSize) => {
    const key = makeImplicitCacheKey(formula, xMin, xMax, yMin, yMax, gridSize);
    return get().implicitCache.get(key) ?? null;
  },
  setCachedImplicit: (formula, xMin, xMax, yMin, yMax, gridSize, curves) => {
    const key = makeImplicitCacheKey(formula, xMin, xMax, yMin, yMax, gridSize);
    set((s) => {
      const next = new Map(s.implicitCache).set(key, curves);
      if (next.size > MAX_CACHE_ENTRIES) {
        const firstKey = next.keys().next().value;
        if (firstKey !== undefined) next.delete(firstKey);
      }
      return { implicitCache: next };
    });
  },
  invalidateCache: () => set({ graphCache: new Map(), implicitCache: new Map() }),
  reset: () =>
    set({
      ...defaultState,
      graphCache: new Map(),
      implicitCache: new Map(),
    }),
}));
