import { create } from 'zustand';

export interface Point {
  x: number;
  y: number;
}

/** 뷰포트 자동: 줌/팬한 구간만 계산. 수동: 사용자가 x_min, x_max 입력 */
export type ViewportMode = 'auto' | 'manual';

/** x 범위 상한 (|xMax - xMin| ≤ 2e6). 극단적 줌 아웃 시 포인트 폭증 방지 */
export const X_RANGE_LIMIT = 2e6;

export interface ViewportBounds {
  xMin: number;
  xMax: number;
}

/** 캐시 키: (formula, xMin, xMax, step) → points */
export type GraphCacheKey = string;

function makeCacheKey(formula: string, xMin: number, xMax: number, step: number): GraphCacheKey {
  return `${formula}|${xMin}|${xMax}|${step}`;
}

interface GraphState {
  formula: string;
  xMin: number;
  xMax: number;
  step: number;
  points: Point[];
  loading: boolean;
  error: string | null;
  /** 뷰포트 자동 모드가 기본값 */
  viewportMode: ViewportMode;
  /** 뷰포트 모드에서 사용하는 현재 bounds (GraphCanvas가 설정) */
  viewportBounds: ViewportBounds | null;
  /** (formula, xMin, xMax, step) → points 캐시 */
  graphCache: Map<GraphCacheKey, Point[]>;
  setFormula: (formula: string) => void;
  setRange: (xMin: number, xMax: number, step: number) => void;
  setPoints: (points: Point[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setViewportMode: (mode: ViewportMode) => void;
  setViewportBounds: (bounds: ViewportBounds | null) => void;
  /** 캐시에서 조회. 없으면 null */
  getCachedPoints: (formula: string, xMin: number, xMax: number, step: number) => Point[] | null;
  /** 캐시에 저장 */
  setCachedPoints: (formula: string, xMin: number, xMax: number, step: number, points: Point[]) => void;
  /** 수식 변경 시 캐시 무효화 */
  invalidateCache: () => void;
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
  viewportMode: 'auto' as ViewportMode,
  viewportBounds: null as ViewportBounds | null,
  graphCache: new Map<GraphCacheKey, Point[]>(),
};

export const useGraphStore = create<GraphState>((set, get) => ({
  ...defaultState,
  setFormula: (formula) =>
    set({ formula, error: null, graphCache: new Map() }),
  setRange: (xMin, xMax, step) =>
    set({ xMin, xMax, step, error: null }),
  setPoints: (points) => set({ points, loading: false, error: null }),
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
    set((s) => ({
      graphCache: new Map(s.graphCache).set(key, points),
    }));
  },
  invalidateCache: () => set({ graphCache: new Map() }),
  reset: () => set({ ...defaultState, graphCache: new Map() }),
}));
