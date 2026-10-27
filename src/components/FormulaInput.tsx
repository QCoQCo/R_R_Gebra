import React, { useRef, useEffect, useState } from 'react';
import 'mathlive';
import { isWithinRangeLimit, useGraphStore } from '../store/graphStore';
import type { FormulaType } from '../store/graphStore';
import {
    latexToMeval,
    latexToMevalImplicit,
    checkUnsupportedLatex,
    detectFormulaType,
} from '../utils/latexToMeval';
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

/** math-field 의 LaTeX → (meval 수식, 수식 타입). 빈 입력이면 formula 는 '' */
function parseLatex(latex: string): { formula: string; type: FormulaType } {
    const type = detectFormulaType(latex);
    const formula = type === 'implicit' ? latexToMevalImplicit(latex) : latexToMeval(latex);
    return { formula: formula?.trim() ?? '', type };
}

interface NumberInputProps {
    id: string;
    value: number;
    onCommit: (value: number) => void;
    isValid?: (value: number) => boolean;
    /** 입력값이 유효하지 않을 때 툴팁으로 보여 줄 안내 */
    invalidMessage?: string;
    step: string;
    min?: string;
}

const RANGE_LIMIT_MESSAGE = '범위는 -1,000,000 ~ 1,000,000 사이로 입력해 주세요 (그래프 표시 한계)';

/**
 * 스토어 값과 연결된 숫자 입력.
 * 빈 칸, "-" 같은 입력 도중 상태나 유효하지 않은 값은 스토어에 반영하지 않고,
 * 포커스를 잃으면 마지막으로 반영된 값으로 되돌린다. (기존: 칸을 비우면 즉시 0 반영)
 */
function NumberInput({
    id,
    value,
    onCommit,
    isValid = Number.isFinite,
    invalidMessage,
    step,
    min,
}: NumberInputProps) {
    const [draft, setDraft] = useState(String(value));
    const invalid = draft.trim() !== '' && !isValid(Number(draft));

    // 바깥에서 값이 바뀌면 동기화. "1." 처럼 같은 값을 뜻하는 입력 중 초안은 유지
    useEffect(() => {
        setDraft((d) => (d.trim() !== '' && Number(d) === value ? d : String(value)));
    }, [value]);

    return (
        <input
            id={id}
            type='number'
            value={draft}
            onChange={(e) => {
                const text = e.target.value;
                setDraft(text);
                const next = Number(text);
                if (text.trim() !== '' && isValid(next)) onCommit(next);
            }}
            onBlur={() => setDraft(String(value))}
            aria-invalid={invalid}
            title={invalid ? invalidMessage : undefined}
            step={step}
            min={min}
        />
    );
}

export function FormulaInput({ theme, setTheme }: FormulaInputProps) {
    const mfRef = useRef<MathfieldElement | null>(null);
    const [showRange, setShowRange] = useState(false);
    const [showControlPanel, setShowControlPanel] = useState(false); // 기본값: 접힌 상태
    const {
        xMin,
        xMax,
        yMin,
        yMax,
        step,
        loading,
        error,
        viewportMode,
        setRange2D,
        setError,
        setExpression,
        submitExpression,
        setViewportMode,
    } = useGraphStore();

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
                const { formula, type } = parseLatex(latex);
                setExpression(formula, type);
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
    }, [setExpression]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const latex = mfRef.current?.value ?? '';
        const unsupported = checkUnsupportedLatex(latex);
        if (unsupported) {
            setError(unsupported);
            return;
        }
        const { formula, type } = parseLatex(latex);
        submitExpression(formula, type);
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.row}>
                <label htmlFor='formula'>수식 f:</label>
                {React.createElement('math-field', {
                    ref: (el: HTMLElement | null) => {
                        mfRef.current = el as MathfieldElement | null;
                    },
                    id: 'formula',
                    className: styles.mathField,
                    'math-virtual-keyboard-policy': 'manual',
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
                            <NumberInput
                                id='xMin'
                                value={xMin}
                                isValid={isWithinRangeLimit}
                                invalidMessage={RANGE_LIMIT_MESSAGE}
                                onCommit={(v) => setRange2D(v, xMax, yMin, yMax, step)}
                                step='0.5'
                            />
                            <label htmlFor='xMax'>x 최대</label>
                            <NumberInput
                                id='xMax'
                                value={xMax}
                                isValid={isWithinRangeLimit}
                                invalidMessage={RANGE_LIMIT_MESSAGE}
                                onCommit={(v) => setRange2D(xMin, v, yMin, yMax, step)}
                                step='0.5'
                            />
                            <label htmlFor='yMin'>y 최소</label>
                            <NumberInput
                                id='yMin'
                                value={yMin}
                                isValid={isWithinRangeLimit}
                                invalidMessage={RANGE_LIMIT_MESSAGE}
                                onCommit={(v) => setRange2D(xMin, xMax, v, yMax, step)}
                                step='0.5'
                            />
                            <label htmlFor='yMax'>y 최대</label>
                            <NumberInput
                                id='yMax'
                                value={yMax}
                                isValid={isWithinRangeLimit}
                                invalidMessage={RANGE_LIMIT_MESSAGE}
                                onCommit={(v) => setRange2D(xMin, xMax, yMin, v, step)}
                                step='0.5'
                            />
                            <label htmlFor='step'>간격</label>
                            <NumberInput
                                id='step'
                                value={step}
                                onCommit={(v) => setRange2D(xMin, xMax, yMin, yMax, v)}
                                isValid={(v) => Number.isFinite(v) && v > 0}
                                step='0.01'
                                min='0.01'
                            />
                        </div>
                    )}
                </div>
            )}
            <div className={styles.submitRow}>
                <button type='submit'>
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
