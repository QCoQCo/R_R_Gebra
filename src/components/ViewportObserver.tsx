import { useEffect, useRef } from 'react';
import { usePaneContext } from 'mafs';
import type { ViewportBounds } from '../store/graphStore';
import { X_RANGE_LIMIT } from '../store/graphStore';

function clampBounds(bounds: ViewportBounds): ViewportBounds {
  const xSpan = bounds.xMax - bounds.xMin;
  const ySpan = bounds.yMax - bounds.yMin;
  const xOk = xSpan <= X_RANGE_LIMIT;
  const yOk = ySpan <= X_RANGE_LIMIT;
  if (xOk && yOk) return bounds;
  let { xMin, xMax, yMin, yMax } = bounds;
  if (!xOk) {
    const half = X_RANGE_LIMIT / 2;
    const center = (xMin + xMax) / 2;
    xMin = center - half;
    xMax = center + half;
  }
  if (!yOk) {
    const half = X_RANGE_LIMIT / 2;
    const center = (yMin + yMax) / 2;
    yMin = center - half;
    yMax = center + half;
  }
  return { xMin, xMax, yMin, yMax };
}

interface ViewportObserverProps {
  width: number;
  height: number;
  formula: string;
  onBoundsChange: (bounds: ViewportBounds) => void;
  onPendingChange?: (pending: boolean) => void;
  debounceMs?: number;
}

/**
 * Mafs 내부에서 usePaneContext로 현재 화면에 표시된 좌표 범위를 가져와
 * 해당 구간만 계산. viewBox와 무관하게 실제 보이는 영역에 맞춤.
 */
export function ViewportObserver({
  width,
  height,
  formula,
  onBoundsChange,
  onPendingChange,
  debounceMs = 250,
}: ViewportObserverProps) {
  const { xPaneRange, yPaneRange } = usePaneContext();
  const [xMin, xMax] = xPaneRange;
  const [yMin, yMax] = yPaneRange;
  const lastBoundsRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (width <= 0 || height <= 0) return;

    onPendingChange?.(true);

    const run = () => {
      onPendingChange?.(false);
      if (xMax <= xMin || yMax <= yMin) return;
      const raw: ViewportBounds = { xMin, xMax, yMin, yMax };
      const bounds = clampBounds(raw);
      const key = `${bounds.xMin},${bounds.xMax},${bounds.yMin},${bounds.yMax}`;
      if (lastBoundsRef.current === key) return;
      lastBoundsRef.current = key;
      onBoundsChange(bounds);
    };

    timeoutRef.current = setTimeout(run, debounceMs);
    return () => {
      onPendingChange?.(false);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [width, height, formula, xMin, xMax, yMin, yMax, onBoundsChange, onPendingChange, debounceMs]);

  return null;
}
