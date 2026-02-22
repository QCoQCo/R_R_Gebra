import type { ViewportBounds } from './store/graphStore';

/** explicit y=f(x) 그래프: 뷰포트당 샘플 수 */
export const POINTS_PER_VIEW = 500;

/** 암시적 방정식 그리드: 최소/최대 해상도 (하트 등 곡률이 큰 곡선도 부드럽게) */
export const IMPLICIT_GRID_MIN = 80;
export const IMPLICIT_GRID_MAX = 320;

/** 캐시 최대 엔트리 수 (LRU eviction). graphCache, implicitCache 각각 적용 */
export const MAX_CACHE_ENTRIES = 20;

/**
 * 뷰포트 span에 따라 암시적 방정식 그리드 해상도 동적 계산.
 * 하트 곡선 (x²+y²-1)³-x²y³=0 등 축과 닿는 부분의 울퉁불퉁함을 줄이기 위해
 * 충분한 해상도 확보.
 */
export function computeImplicitGridSize(bounds: ViewportBounds): number {
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const span = Math.max(xSpan, ySpan);
  const gridSize = Math.round(span * 12);
  return Math.min(IMPLICIT_GRID_MAX, Math.max(IMPLICIT_GRID_MIN, gridSize));
}
