import { useEffect, useRef } from 'react';
import { usePaneContext } from 'mafs';
import type { ViewportBounds } from '../store/graphStore';
import { X_RANGE_LIMIT } from '../store/graphStore';

function clampBounds(bounds: ViewportBounds): ViewportBounds {
  const span = bounds.xMax - bounds.xMin;
  if (span <= X_RANGE_LIMIT) return bounds;
  const half = X_RANGE_LIMIT / 2;
  const center = (bounds.xMin + bounds.xMax) / 2;
  return { xMin: center - half, xMax: center + half };
}

interface ViewportObserverProps {
  width: number;
  height: number;
  onBoundsChange: (bounds: ViewportBounds) => void;
  debounceMs?: number;
}

/**
 * Mafs 내부에서 usePaneContext로 현재 화면에 표시된 좌표 범위를 가져와
 * 해당 구간만 계산. viewBox와 무관하게 실제 보이는 영역에 맞춤.
 */
export function ViewportObserver({
  width,
  height,
  onBoundsChange,
  debounceMs = 250,
}: ViewportObserverProps) {
  const { xPaneRange } = usePaneContext();
  const [xMin, xMax] = xPaneRange;
  const lastBoundsRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (width <= 0 || height <= 0) return;

    const run = () => {
      const raw: ViewportBounds = { xMin, xMax };
      const bounds = clampBounds(raw);
      const key = `${bounds.xMin},${bounds.xMax}`;
      if (lastBoundsRef.current === key) return;
      lastBoundsRef.current = key;
      onBoundsChange(bounds);
    };

    timeoutRef.current = setTimeout(run, debounceMs);
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [width, height, xMin, xMax, onBoundsChange, debounceMs]);

  return null;
}
