import React, { useRef, useEffect, useState, useCallback } from 'react';
import 'mathlive';
import { useGraphStore } from '../store/graphStore';
import { calculateGraph } from '../api';
import { latexToMeval, checkUnsupportedLatex } from '../utils/latexToMeval';
import type { Theme } from '../store/themeStore';
import styles from './FormulaInput.module.scss';

interface FormulaInputProps {
    theme: Theme;
    setTheme: (t: Theme) => void;
}

interface MathfieldElement extends HTMLElement {
    value: string;
    mathVirtualKeyboardPolicy: string;
}

export function FormulaInput({ theme, setTheme }: FormulaInputProps) {
    const mfRef = useRef<MathfieldElement | null>(null);
    const [showRange, setShowRange] = useState(false);
    const [showControlPanel, setShowControlPanel] = useState(false); // 기본값: 접힌 상태
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

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const DEBOUNCE_MS = 500;

        const handleInput = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                const latex = (el as MathfieldElement).value ?? '';
                if (checkUnsupportedLatex(latex)) return;
                const mevalExpr = latexToMeval(latex);
                if (!mevalExpr.trim()) return;
                setFormula(mevalExpr.trim());
            }, DEBOUNCE_MS);
        };

        el.addEventListener('input', handleInput);

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
            if (debounceTimer) clearTimeout(debounceTimer);
            el.removeEventListener('input', handleInput);
            el.removeEventListener('focusin', showKb);
            el.removeEventListener('focusout', hideKb);
        };
    }, [setFormula]);

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
            <div className={styles.controlPanel}>
                <button
                    type='button'
                    className={styles.toggleBtn}
                    onClick={() => setShowControlPanel((v) => !v)}
                    aria-expanded={showControlPanel}
                >
                    {showControlPanel ? '◀ 모드/테마' : '▶ 모드/테마'}
                </button>
                <div className={styles.controlPanelSlide} data-expanded={showControlPanel}>
                    <div className={styles.controlRow}>
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
                        <div className={styles.themeSection} role='group' aria-label='테마 선택'>
                            <span className={styles.modeLabel}>테마</span>
                            {(['light', 'dark', 'system'] as const).map((t) => (
                                <button
                                    key={t}
                                    type='button'
                                    className={styles.modeBtn}
                                    onClick={() => setTheme(t)}
                                    aria-pressed={theme === t}
                                    data-active={theme === t}
                                >
                                    {t === 'light' ? '☀️' : t === 'dark' ? '🌙' : '💻'}{' '}
                                    {t === 'light' ? '밝게' : t === 'dark' ? '어둡게' : '시스템'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
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
