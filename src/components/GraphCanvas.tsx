import { useRef, useEffect, useState, useCallback } from 'react';
import { Mafs, Coordinates, Plot, Theme } from 'mafs';
import { useGraphStore } from '../store/graphStore';
import type { Point } from '../store/graphStore';
import type { ViewportBounds } from '../store/graphStore';
import { calculateGraph } from '../api';
import { ViewportObserver } from './ViewportObserver';
import styles from './GraphCanvas.module.scss';

const POINTS_PER_VIEW = 500;
const DEFAULT_VIEW: [number, number] = [-10, 10];

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
    const {
        points,
        xMin,
        xMax,
        loading,
        viewportMode,
        formula,
        getCachedPoints,
        setCachedPoints,
        setPoints,
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
            setViewportBounds(bounds);
            if (!formula.trim()) return;

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
        },
        [
            formula,
            getCachedPoints,
            setCachedPoints,
            setPoints,
            setLoading,
            setError,
            setViewportBounds,
        ]
    );

    const viewBox =
        viewportMode === 'manual'
            ? { x: [xMin, xMax] as [number, number], y: [xMin, xMax] as [number, number] }
            : { x: DEFAULT_VIEW, y: DEFAULT_VIEW };

    return (
        <div ref={containerRef} className={styles.canvas}>
            {loading && (
                <div className={styles.loadingOverlay} aria-live='polite'>
                    <span className={styles.loadingSpinner} />
                    <span>계산 중...</span>
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
                        onBoundsChange={handleViewportBoundsChange}
                        debounceMs={250}
                    />
                )}
                <Coordinates.Cartesian subdivisions={4} />
                {points.length >= 2 && (
                    <Plot.Parametric
                        domain={[0, 1]}
                        xy={(t) => interpolatePoints(points, t)}
                        color={Theme.blue}
                    />
                )}
            </Mafs>
        </div>
    );
}
