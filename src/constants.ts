import type { ViewportBounds } from './store/graphStore';

/** 그래프 기본 표시 범위 (x, y 공통) */
export const DEFAULT_VIEW: [number, number] = [-10, 10];

/** 뷰포트를 아직 모를 때(auto 모드 첫 계산) 쓰는 범위 */
export const DEFAULT_BOUNDS: ViewportBounds = {
  xMin: DEFAULT_VIEW[0],
  xMax: DEFAULT_VIEW[1],
  yMin: DEFAULT_VIEW[0],
  yMax: DEFAULT_VIEW[1],
};

/** explicit y=f(x) 그래프: 뷰포트당 샘플 수 */
export const POINTS_PER_VIEW = 500;

/** 암시적 방정식: 화면 한 변당 격자 칸 수 (확대 정도와 무관하게 일정) */
export const IMPLICIT_CELLS_PER_VIEW = 320;

/** 암시적 방정식 격자 한 변 최대 크기 (Rust MAX_GRID_SIZE 와 동일) */
export const MAX_IMPLICIT_GRID = 1024;

/**
 * auto 모드에서 화면 밖으로 미리 계산해 두는 여유 (각 방향, 화면 범위 대비 비율).
 * 팬하면 새로 드러나는 영역이 재계산(250ms 디바운스 + 계산) 전에도 이미 그려져 있도록.
 */
export const PREFETCH_RATIO = 0.25;

/** 캐시 최대 엔트리 수 (LRU eviction) */
export const MAX_CACHE_ENTRIES = 20;

export interface ComputeWindow {
  /** 백엔드에 요청할 범위 (prefetch 면 화면보다 넓음) */
  bounds: ViewportBounds;
  /** explicit 샘플 간격 */
  step: number;
  /** implicit 격자 한 변 크기 */
  gridSize: number;
}

/**
 * 화면 범위로부터 실제 계산 범위와 해상도를 정한다.
 * 해상도는 여유를 뺀 화면 기준이라, 여유를 붙여도 화면 안의 샘플·격자 밀도는 같다.
 * (기존 격자 크기는 단위 길이당 12칸을 [80, 320]으로 잘라 확대할수록 화면 대비 성겨졌음)
 * @param view 화면에 보이는 범위 (manual 모드면 입력한 범위)
 * @param prefetch 화면 밖 여유를 함께 계산할지 (auto 모드)
 * @param manualStep explicit 샘플 간격을 직접 지정 (manual 모드)
 */
export function computeWindow(
  view: ViewportBounds,
  prefetch: boolean,
  manualStep?: number
): ComputeWindow {
  const xSpan = view.xMax - view.xMin;
  const ySpan = view.yMax - view.yMin;
  const pad = prefetch ? PREFETCH_RATIO : 0;
  return {
    bounds: {
      xMin: view.xMin - xSpan * pad,
      xMax: view.xMax + xSpan * pad,
      yMin: view.yMin - ySpan * pad,
      yMax: view.yMax + ySpan * pad,
    },
    step: manualStep ?? xSpan / POINTS_PER_VIEW,
    gridSize: Math.min(MAX_IMPLICIT_GRID, Math.round(IMPLICIT_CELLS_PER_VIEW * (1 + 2 * pad))),
  };
}
