import React, { useRef, useEffect, useState, useCallback } from 'react';
import 'mathlive';
import { useGraphStore } from '../store/graphStore';
import { calculateGraph } from '../api';
import { latexToMeval, checkUnsupportedLatex } from '../utils/latexToMeval';
import styles from './FormulaInput.module.scss';

interface MathfieldElement extends HTMLElement {
    value: string;
    mathVirtualKeyboardPolicy: string;
}

export function FormulaInput() {
    const mfRef = useRef<MathfieldElement | null>(null);
    const [showRange, setShowRange] = useState(false);
    const { xMin, xMax, step, loading, error, formula, viewportMode, setRange, setPoints, setLoading, setError, setFormula, setCachedPoints, setViewportMode } =
        useGraphStore();

    const effectiveStep = viewportMode === 'auto' ? (xMax - xMin) / 500 : step;

    const recalculateWithManualRange = useCallback(async () => {
        const latex = mfRef.current?.value ?? '';
        if (checkUnsupportedLatex(latex)) return;
        const mevalExpr = latexToMeval(latex);
        if (!mevalExpr.trim()) return;
        setFormula(mevalExpr.trim());
        setLoading(true);
        setError(null);
        try {
            const pts = await calculateGraph({
                formula: mevalExpr.trim(),
                x_min: xMin,
                x_max: xMax,
                step,
            });
            setCachedPoints(mevalExpr.trim(), xMin, xMax, step, pts);
            setPoints(pts);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [xMin, xMax, step, setFormula, setLoading, setError, setCachedPoints, setPoints]);

    useEffect(() => {
        const el = mfRef.current;
        if (!el) return;

        el.mathVirtualKeyboardPolicy = 'manual';
        const showKb = () => {
            const kb = window.mathVirtualKeyboard;
            if (kb) {
                (kb as unknown as { layouts: string[] }).layouts = [
                    'numeric',
                    'symbols',
                    'alphabetic',
                ];
                kb.show();
            }
        };
        const hideKb = () => {
            window.mathVirtualKeyboard?.hide();
        };

        el.addEventListener('focusin', showKb);
        el.addEventListener('focusout', hideKb);

        return () => {
            el.removeEventListener('focusin', showKb);
            el.removeEventListener('focusout', hideKb);
        };
    }, []);

    const prevModeRef = useRef(viewportMode);
    useEffect(() => {
        if (viewportMode === 'manual' && prevModeRef.current === 'auto' && formula.trim()) {
            recalculateWithManualRange();
        }
        prevModeRef.current = viewportMode;
    }, [viewportMode, formula, recalculateWithManualRange]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const latex = mfRef.current?.value ?? '';
        const unsupported = checkUnsupportedLatex(latex);
        if (unsupported) {
            setError(unsupported);
            return;
        }
        const mevalExpr = latexToMeval(latex);
        if (!mevalExpr.trim()) return;
        setFormula(mevalExpr.trim());
        setLoading(true);
        setError(null);

        try {
            const pts = await calculateGraph({
                formula: mevalExpr.trim(),
                x_min: xMin,
                x_max: xMax,
                step: effectiveStep,
            });
            setCachedPoints(mevalExpr.trim(), xMin, xMax, effectiveStep, pts);
            setPoints(pts);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.row}>
                <label htmlFor='formula'>수식 (y = f(x))</label>
                {React.createElement('math-field', {
                    ref: (el: HTMLElement | null) => {
                        mfRef.current = el as MathfieldElement | null;
                    },
                    id: 'formula',
                    className: styles.mathField,
                    'math-virtual-keyboard-policy': 'manual',
                    disabled: loading,
                })}
            </div>
            <div className={styles.modeSection}>
                <span className={styles.modeLabel}>모드</span>
                <button
                    type='button'
                    className={styles.modeBtn}
                    onClick={() => setViewportMode('auto')}
                    aria-pressed={viewportMode === 'auto'}
                    data-active={viewportMode === 'auto'}
                >
                    뷰포트 자동
                </button>
                <button
                    type='button'
                    className={styles.modeBtn}
                    onClick={() => setViewportMode('manual')}
                    aria-pressed={viewportMode === 'manual'}
                    data-active={viewportMode === 'manual'}
                >
                    수동 범위
                </button>
            </div>
            {viewportMode === 'manual' && (
            <div className={styles.rangeSection}>
                <button
                    type='button'
                    className={styles.toggleBtn}
                    onClick={() => setShowRange((v) => !v)}
                    aria-expanded={showRange}
                >
                    {showRange ? '▼ 범위 설정 숨기기' : '▶ 범위 설정'}
                </button>
                {showRange && (
                    <div className={styles.row}>
                        <label htmlFor='xMin'>x 최소</label>
                        <input
                            id='xMin'
                            type='number'
                            value={xMin}
                            onChange={(e) => setRange(Number(e.target.value), xMax, step)}
                            step='0.5'
                            disabled={loading}
                        />
                        <label htmlFor='xMax'>x 최대</label>
                        <input
                            id='xMax'
                            type='number'
                            value={xMax}
                            onChange={(e) => setRange(xMin, Number(e.target.value), step)}
                            step='0.5'
                            disabled={loading}
                        />
                        <label htmlFor='step'>간격</label>
                        <input
                            id='step'
                            type='number'
                            value={step}
                            onChange={(e) => setRange(xMin, xMax, Number(e.target.value))}
                            step='0.01'
                            min='0.01'
                            disabled={loading}
                        />
                    </div>
                )}
            </div>
            )}
            <div className={styles.submitRow}>
                <button type='submit' disabled={loading}>
                    {loading && <span className={styles.spinner} aria-hidden />}
                    {loading ? '계산 중...' : '그래프 그리기'}
                </button>
            </div>
            {error && (
                <p className={styles.error} role='alert'>
                    {error}
                </p>
            )}
        </form>
    );
}
