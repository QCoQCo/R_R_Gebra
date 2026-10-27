import { useRef, useEffect, useMemo, useState } from 'react';
import { Mafs, Polyline, Theme } from 'mafs';
import { useGraphStore } from '../store/graphStore';
import { DEFAULT_VIEW } from '../constants';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { AdaptiveCoordinates } from './AdaptiveCoordinates';
import { ViewportObserver } from './ViewportObserver';
import styles from './GraphCanvas.module.scss';

/** 수동 범위 입력이 멈춘 뒤 다시 계산하기까지 기다리는 시간 */
const MANUAL_RANGE_DEBOUNCE_MS = 300;

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
        step,
        loading,
        viewportMode,
        formula,
        viewportBounds,
        recomputeToken,
        compute,
        setViewportBounds,
    } = useGraphStore();

    // Mafs Polyline 형식([x, y][])으로 한 번만 변환. 점이 1개뿐인 조각은 그릴 선이 없음
    const polylines = useMemo(
        () =>
            curves
                .filter((curve) => curve.length >= 2)
                .map((curve) => curve.map((p): [number, number] => [p.x, p.y])),
        [curves]
    );

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

    // manual 모드: 범위·간격 입력이 멈추면 다시 계산 (입력값 검증은 NumberInput 이 담당)
    const manualRangeKey = viewportMode === 'manual' ? `${xMin},${xMax},${yMin},${yMax},${step}` : '';
    const settledManualRange = useDebouncedValue(manualRangeKey, MANUAL_RANGE_DEBOUNCE_MS);

    // 수식·모드·뷰포트·수동 범위가 바뀌거나 "그래프 그리기"를 누르면 재계산
    useEffect(() => {
        compute();
    }, [formula, formulaType, viewportMode, viewportBounds, settledManualRange, recomputeToken, compute]);

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
            {/* key: 모드가 바뀌면 다시 마운트해 auto 모드에서 팬/줌한 카메라를 버림.
                manual 모드는 입력한 범위만 계산하므로 팬/줌을 끔 (움직이면 계산 안 된 영역이 보임) */}
            <Mafs
                key={viewportMode}
                width={size.width}
                height={size.height}
                viewBox={viewBox}
                preserveAspectRatio='contain'
                zoom={viewportMode === 'auto' ? { min: 0.1, max: 10 } : false}
                pan={viewportMode === 'auto'}
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
                {/* 계산된 점을 그대로 잇는다. (기존 Plot.Parametric 은 팬/줌마다 보간 함수를 다시 샘플링) */}
                {polylines.map((points, i) => (
                    <Polyline key={i} points={points} color={Theme.blue} />
                ))}
            </Mafs>
        </div>
    );
}
