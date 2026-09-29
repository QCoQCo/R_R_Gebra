import { create } from 'zustand';
import { calculateGraph, calculateImplicit } from '../api';
import type { Point } from '../api';
import {
  DEFAULT_BOUNDS,
  MAX_CACHE_ENTRIES,
  POINTS_PER_VIEW,
  computeImplicitGridSize,
} from '../constants';

export type { Point };

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

/** 새 엔트리를 추가한 캐시 사본. MAX_CACHE_ENTRIES 초과 시 가장 오래된 엔트리 제거 */
function withCacheEntry<K, V>(cache: Map<K, V>, key: K, value: V): Map<K, V> {
  const next = new Map(cache).set(key, value);
  if (next.size > MAX_CACHE_ENTRIES) {
    const firstKey = next.keys().next().value;
    if (firstKey !== undefined) next.delete(firstKey);
  }
  return next;
}

/**
 * 가장 최근 compute 호출 번호. 응답이 도착했을 때 이 값과 다르면
 * 더 새로운 요청이 있다는 뜻이므로 결과를 버린다 (응답 순서 역전 방지).
 */
let latestRequestId = 0;

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
  /** "그래프 그리기"를 누를 때마다 증가. 수식이 같아도 다시 계산하게 하는 트리거 */
  recomputeToken: number;
  graphCache: Map<GraphCacheKey, Point[]>;
  implicitCache: Map<ImplicitCacheKey, Point[][]>;
  /** 입력 중 수식 반영 (디바운스된 실시간 입력) */
  setExpression: (formula: string, formulaType: FormulaType) => void;
  /** "그래프 그리기": 수식 반영 + 강제 재계산 */
  submitExpression: (formula: string, formulaType: FormulaType) => void;
  setRange2D: (xMin: number, xMax: number, yMin: number, yMax: number, step: number) => void;
  setError: (error: string | null) => void;
  setViewportMode: (mode: ViewportMode) => void;
  setViewportBounds: (bounds: ViewportBounds | null) => void;
  /**
   * 현재 수식·모드·범위로 그래프를 계산한다. 모든 계산은 이 함수를 거친다.
   * - auto 모드: 현재 뷰포트(없으면 기본 범위), manual 모드: 입력한 범위
   * - 캐시에 있으면 바로 반영, 없으면 백엔드 호출
   * - 더 최신 호출이 있으면 결과를 버림
   */
  compute: () => Promise<void>;
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
  recomputeToken: 0,
  graphCache: new Map<GraphCacheKey, Point[]>(),
  implicitCache: new Map<ImplicitCacheKey, Point[][]>(),
};

export const useGraphStore = create<GraphState>((set, get) => ({
  ...defaultState,
  setExpression: (formula, formulaType) => set({ formula, formulaType, error: null }),
  submitExpression: (formula, formulaType) =>
    set((s) => ({ formula, formulaType, error: null, recomputeToken: s.recomputeToken + 1 })),
  setRange2D: (xMin, xMax, yMin, yMax, step) =>
    set({ xMin, xMax, yMin, yMax, step, error: null }),
  setError: (error) => set({ error, loading: false }),
  setViewportMode: (mode) => set({ viewportMode: mode }),
  setViewportBounds: (bounds) => set({ viewportBounds: bounds }),
  compute: async () => {
    const id = ++latestRequestId;
    const isLatest = () => id === latestRequestId;
    const s = get();
    const formula = s.formula.trim();

    if (!formula) {
      set({ points: [], implicitCurves: [], loading: false, error: null });
      return;
    }

    const bounds: ViewportBounds =
      s.viewportMode === 'manual'
        ? { xMin: s.xMin, xMax: s.xMax, yMin: s.yMin, yMax: s.yMax }
        : (s.viewportBounds ?? DEFAULT_BOUNDS);
    const { xMin, xMax, yMin, yMax } = bounds;

    try {
      if (s.formulaType === 'explicit') {
        const step = s.viewportMode === 'manual' ? s.step : (xMax - xMin) / POINTS_PER_VIEW;
        const key = makeCacheKey(formula, xMin, xMax, step);
        let points = s.graphCache.get(key);
        if (!points) {
          set({ loading: true, error: null });
          points = await calculateGraph({ formula, x_min: xMin, x_max: xMax, step });
          const result = points;
          set((st) => ({ graphCache: withCacheEntry(st.graphCache, key, result) }));
        }
        if (isLatest()) set({ points, implicitCurves: [], loading: false, error: null });
      } else {
        const gridSize = computeImplicitGridSize(bounds);
        const key = makeImplicitCacheKey(formula, xMin, xMax, yMin, yMax, gridSize);
        let curves = s.implicitCache.get(key);
        if (!curves) {
          set({ loading: true, error: null });
          curves = await calculateImplicit({
            formula,
            x_min: xMin,
            x_max: xMax,
            y_min: yMin,
            y_max: yMax,
            grid_size: gridSize,
          });
          const result = curves;
          set((st) => ({ implicitCache: withCacheEntry(st.implicitCache, key, result) }));
        }
        if (isLatest()) set({ implicitCurves: curves, points: [], loading: false, error: null });
      }
    } catch (err) {
      if (isLatest()) set({ error: err instanceof Error ? err.message : String(err), loading: false });
    }
  },
  invalidateCache: () => set({ graphCache: new Map(), implicitCache: new Map() }),
  reset: () =>
    set({
      ...defaultState,
      graphCache: new Map(),
      implicitCache: new Map(),
    }),
}));
