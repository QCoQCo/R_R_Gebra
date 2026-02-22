import { useRef, useEffect, useState, useCallback } from 'react';
import { Mafs, Coordinates, Plot, Theme } from 'mafs';
import { useGraphStore } from '../store/graphStore';
import type { Point } from '../store/graphStore';
import type { ViewportBounds } from '../store/graphStore';
import { calculateGraph, calculateImplicit } from '../api';
import { POINTS_PER_VIEW, computeImplicitGridSize } from '../constants';
import { ViewportObserver } from './ViewportObserver';
import styles from './GraphCanvas.module.scss';
const DEFAULT_VIEW: [number, number] = [-10, 10];

/** 뷰포트 x 범위(span)에 따라 축 눈금 간격 반환. 겹침 방지 */
function axisLineInterval(span: number): number {
    if (span <= 10) return 0.5;
    if (span <= 40) return 1;
    if (span <= 150) return 5;
    return 10;
}

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
        points,
        implicitCurves,
        formulaType,
        xMin,
        xMax,
        yMin,
        yMax,
        loading,
        viewportMode,
        formula,
        viewportBounds,
        getCachedPoints,
        getCachedImplicit,
        setCachedPoints,
        setCachedImplicit,
        setPoints,
        setImplicitCurves,
        setLoading,
        setError,
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

    const handleViewportBoundsChange = useCallback(
        async (bounds: ViewportBounds) => {
            if (bounds.xMax <= bounds.xMin || bounds.yMax <= bounds.yMin) return;
            setViewportBounds(bounds);
            if (!formula.trim()) return;

            if (formulaType === 'explicit') {
                const span = bounds.xMax - bounds.xMin;
                const step = span / POINTS_PER_VIEW;
                const cached = getCachedPoints(formula, bounds.xMin, bounds.xMax, step);
                if (cached) {
                    setPoints(cached);
                    return;
                }
                setLoading(true);
                setError(null);
                try {
                    const newPoints = await calculateGraph({
                        formula,
                        x_min: bounds.xMin,
                        x_max: bounds.xMax,
                        step,
                    });
                    setCachedPoints(formula, bounds.xMin, bounds.xMax, step, newPoints);
                    setPoints(newPoints);
                } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            } else {
                const gridSize = computeImplicitGridSize(bounds);
                const cached = getCachedImplicit(
                    formula,
                    bounds.xMin,
                    bounds.xMax,
                    bounds.yMin,
                    bounds.yMax,
                    gridSize
                );
                if (cached) {
                    setImplicitCurves(cached);
                    return;
                }
                setLoading(true);
                setError(null);
                try {
                    const curves = await calculateImplicit({
                        formula,
                        x_min: bounds.xMin,
                        x_max: bounds.xMax,
                        y_min: bounds.yMin,
                        y_max: bounds.yMax,
                        grid_size: gridSize,
                    });
                    setCachedImplicit(
                        formula,
                        bounds.xMin,
                        bounds.xMax,
                        bounds.yMin,
                        bounds.yMax,
                        gridSize,
                        curves
                    );
                    setImplicitCurves(curves);
                } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                }
            }
        },
        [
            formula,
            formulaType,
            getCachedPoints,
            getCachedImplicit,
            setCachedPoints,
            setCachedImplicit,
            setPoints,
            setImplicitCurves,
            setLoading,
            setError,
            setViewportBounds,
        ],
    );

    // auto 모드: formula가 있고 viewportBounds가 아직 없을 때 초기 계산 (ViewportObserver 250ms 대기 전)
    useEffect(() => {
        if (
            viewportMode !== 'auto' ||
            !formula.trim() ||
            viewportBounds !== null ||
            loading
        )
            return;
        const initialBounds: ViewportBounds = {
            xMin: DEFAULT_VIEW[0],
            xMax: DEFAULT_VIEW[1],
            yMin: DEFAULT_VIEW[0],
            yMax: DEFAULT_VIEW[1],
        };
        handleViewportBoundsChange(initialBounds);
    }, [
        viewportMode,
        formula,
        viewportBounds,
        loading,
        handleViewportBoundsChange,
    ]);

    const viewBox =
        viewportMode === 'manual'
            ? {
                  x: [xMin, xMax] as [number, number],
                  y: [yMin, yMax] as [number, number],
              }
            : { x: DEFAULT_VIEW, y: DEFAULT_VIEW };

    const xSpan =
        viewportMode === 'manual'
            ? xMax - xMin
            : viewportBounds
              ? viewportBounds.xMax - viewportBounds.xMin
              : 20;
    const span = xSpan;
    const lineInterval = axisLineInterval(span);

    return (
        <div ref={containerRef} className={styles.canvas}>
            {(loading || pending) && (
                <div
                    className={styles.loadingOverlay}
                    aria-live='polite'
                    data-pending={pending && !loading}
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
                {viewportMode === 'auto' && formula.trim() && (
                    <ViewportObserver
                        width={size.width}
                        height={size.height}
                        formula={formula}
                        onBoundsChange={handleViewportBoundsChange}
                        onPendingChange={setPending}
                        debounceMs={250}
                    />
                )}
                <Coordinates.Cartesian
                    subdivisions={4}
                    xAxis={{ lines: lineInterval }}
                    yAxis={{ lines: lineInterval }}
                />
                {formulaType === 'explicit' && points.length >= 2 && (
                    <Plot.Parametric
                        domain={[0, 1]}
                        xy={(t) => interpolatePoints(points, t)}
                        color={Theme.blue}
                    />
                )}
                {formulaType === 'implicit' &&
                    implicitCurves.map((curve, i) =>
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
