import { useRef, useEffect, useState } from 'react';
import { Mafs, Plot, Theme } from 'mafs';
import { useGraphStore } from '../store/graphStore';
import type { Point } from '../store/graphStore';
import { DEFAULT_VIEW } from '../constants';
import { AdaptiveCoordinates } from './AdaptiveCoordinates';
import { ViewportObserver } from './ViewportObserver';
import styles from './GraphCanvas.module.scss';


function interpolatePoints(points: Point[], t: number): [number, number] {
    if (points.length === 0) return [0, 0];
    if (points.length === 1) return [points[0].x, points[0].y];

    const n = points.length - 1;
    const idx = t * n;
    const i = Math.min(Math.floor(idx), n - 1);
    const frac = idx - i;
    const p0 = points[i];
    const p1 = points[i + 1];
    return [p0.x + frac * (p1.x - p0.x), p0.y + frac * (p1.y - p0.y)];
}

export function GraphCanvas() {
    const containerRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ width: 800, height: 800 });
    const [pending, setPending] = useState(false);
    const {
        curves,
        formulaType,
        xMin,
        xMax,
        yMin,
        yMax,
        loading,
        viewportMode,
        formula,
        viewportBounds,
        recomputeToken,
        compute,
        setViewportBounds,
    } = useGraphStore();

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(() => {
            setSize({ width: el.clientWidth, height: el.clientHeight });
        });
        observer.observe(el);
        setSize({ width: el.clientWidth, height: el.clientHeight });
        return () => observer.disconnect();
    }, []);

    // 수식·모드·뷰포트가 바뀌거나 "그래프 그리기"를 누르면 재계산.
    // manual 모드의 범위 입력은 "그래프 그리기"로 반영 (입력 중 값마다 계산하지 않음).
    useEffect(() => {
        compute();
    }, [formula, formulaType, viewportMode, viewportBounds, recomputeToken, compute]);

    // 수동 범위 입력 도중 최소 ≥ 최대가 되는 순간에는 뒤집힌 범위를 Mafs 에 넘기지 않음
    const useManualView = viewportMode === 'manual' && xMin < xMax && yMin < yMax;
    const viewBox = useManualView
        ? {
              x: [xMin, xMax] as [number, number],
              y: [yMin, yMax] as [number, number],
          }
        : { x: DEFAULT_VIEW, y: DEFAULT_VIEW };

    return (
        <div ref={containerRef} className={styles.canvas}>
            {(loading || (pending && formula.trim() !== '')) && (
                <div
                    className={styles.loadingOverlay}
                    aria-live='polite'
                    data-pending={!loading}
                >
                    <span className={styles.loadingSpinner} />
                    <span>{loading ? '계산 중...' : '준비 중...'}</span>
                </div>
            )}
            <Mafs
                width={size.width}
                height={size.height}
                viewBox={viewBox}
                preserveAspectRatio='contain'
                zoom={{ min: 0.1, max: 10 }}
                pan={true}
            >
                {viewportMode === 'auto' && (
                    <ViewportObserver
                        width={size.width}
                        height={size.height}
                        onBoundsChange={setViewportBounds}
                        onPendingChange={setPending}
                        debounceMs={250}
                    />
                )}
                <AdaptiveCoordinates />
                {curves.map((curve, i) =>
                    curve.length >= 2 ? (
                        <Plot.Parametric
                            key={i}
                            domain={[0, 1]}
                            xy={(t) => interpolatePoints(curve, t)}
                            color={Theme.blue}
                        />
                    ) : null
                )}
            </Mafs>
        </div>
    );
}
