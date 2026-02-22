/** 지원하지 않는 LaTeX 기호. 적분, 합 등은 그래프에 사용 불가 */
const UNSUPPORTED_PATTERNS = [
  { pattern: /\\int\b|\\iint|\\iiint|\\oint/g, name: '적분(∫)' },
  { pattern: /\\sum\b|\\prod\b/g, name: '합/곱(∑∏)' },
  { pattern: /\\lim\b/g, name: '극한(lim)' },
];

export type FormulaType = 'explicit' | 'implicit';

/** 수식에 = 가 있고 "y =" 형태가 아니면 암시적 방정식 */
export function detectFormulaType(latex: string): FormulaType {
  const s = latex.trim().replace(/^\s*\$\$?\s*|\s*\$\$?\s*$/g, '').trim();
  if (!s.includes('=')) return 'explicit';
  if (/^\s*y\s*=/i.test(s)) return 'explicit';
  return 'implicit';
}

export function checkUnsupportedLatex(latex: string, _formulaType?: FormulaType): string | null {
  const s = latex.trim().replace(/^\s*\$\$?\s*|\s*\$\$?\s*$/g, '').trim();
  const hint = 'y = f(x) 또는 f(x,y) = 0 형태만 입력해 주세요.';
  for (const { pattern, name } of UNSUPPORTED_PATTERNS) {
    if (pattern.test(s)) return `${name}은(는) 지원하지 않습니다. ${hint}`;
  }
  return null;
}

/**
 * Splits "left = right" at the first top-level "=" (not inside braces).
 */
function splitAtEquals(s: string): [string, string] | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '{' || c === '(') depth++;
    else if (c === '}' || c === ')') depth--;
    else if (c === '=' && depth === 0) {
      return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }
  }
  return null;
}

/**
 * Converts LaTeX (from MathLive) to meval-compatible expression.
 * Handles common math notation: sin, cos, sqrt, frac, powers, etc.
 * @param stripYPrefix - if true, removes "y = " prefix (for explicit y=f(x))
 */
export function latexToMeval(latex: string, stripYPrefix = true): string {
  if (!latex || !latex.trim()) return '';

  let s = latex.trim();

  // Remove $$ or $ wrappers
  s = s.replace(/^\s*\$\$?\s*|\s*\$\$?\s*$/g, '').trim();
  // Remove optional "y = " or "y=" prefix (explicit form only)
  if (stripYPrefix) s = s.replace(/^\s*y\s*=\s*/i, '').trim();

  // \log_{10}(x) → \log(x) (상용로그)
  s = s.replace(/\\log_{10}/g, '\\log');

  // \frac{a}{b} → (a)/(b) - handle nested braces
  s = s.replace(/\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, a, b) => {
    return `(${latexToMeval(a)})/(${latexToMeval(b)})`;
  });
  // \frac15, \frac123 등 (괄호 없음) → (1)/(5), (1)/(23)
  s = s.replace(/\\frac(\d+?)(\d+)/g, (_, a, b) => `(${a})/(${b})`);

  // \sqrt{x} → sqrt(x)
  s = s.replace(/\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, x) => {
    return `sqrt(${latexToMeval(x)})`;
  });

  // \sin(x), \arcsin(x), \sinh(x) 등: LaTeX → meval (arcsin→asin 등 별도 매핑)
  const funcs: Array<{ latex: string; meval: string }> = [
    { latex: 'sin', meval: 'sin' },
    { latex: 'cos', meval: 'cos' },
    { latex: 'tan', meval: 'tan' },
    { latex: 'arcsin', meval: 'asin' },
    { latex: 'arccos', meval: 'acos' },
    { latex: 'arctan', meval: 'atan' },
    { latex: 'sinh', meval: 'sinh' },
    { latex: 'cosh', meval: 'cosh' },
    { latex: 'tanh', meval: 'tanh' },
    { latex: 'asinh', meval: 'asinh' },
    { latex: 'acosh', meval: 'acosh' },
    { latex: 'atanh', meval: 'atanh' },
    { latex: 'ln', meval: 'ln' },
    { latex: 'log', meval: 'log' },
    { latex: 'exp', meval: 'exp' },
    { latex: 'abs', meval: 'abs' },
  ];
  for (const { latex: cmd, meval: fn } of funcs) {
    const reCmd = `\\\\${cmd}`;
    // \sin\left(x\right) or \sin(x) or \sin{x}
    s = s.replace(
      new RegExp(`${reCmd}\\s*\\\\left\\(([^)]*)\\\\\\right\\)`, 'g'),
      (_, arg) => `${fn}(${latexToMeval(arg)})`
    );
    s = s.replace(
      new RegExp(`${reCmd}\\s*\\(([^)]*)\\)`, 'g'),
      (_, arg) => `${fn}(${latexToMeval(arg)})`
    );
    s = s.replace(
      new RegExp(`${reCmd}\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, 'g'),
      (_, arg) => `${fn}(${latexToMeval(arg)})`
    );
    // \sin x^2, \sin x^{n} (괄호 없이, 인자가 x^2 형태) → sin(x^2)
    s = s.replace(
      new RegExp(`${reCmd}\\s+([a-zA-Z0-9.]+)\\^\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, 'g'),
      (_, base, exp) => `${fn}(${base}^(${latexToMeval(exp)}))`
    );
    s = s.replace(
      new RegExp(`${reCmd}\\s+([a-zA-Z0-9.]+)\\^([a-zA-Z0-9.]+)`, 'g'),
      (_, base, exp) => `${fn}(${base}^${exp})`
    );
    // \sin 2x, \sin x (괄호 없이, 단일 항)
    s = s.replace(
      new RegExp(`${reCmd}\\s+([a-zA-Z0-9.]+)`, 'g'),
      (_, arg) => `${fn}(${arg})`
    );
    // \log2, \ln2 (공백 없이 바로 붙은 경우)
    s = s.replace(
      new RegExp(`${reCmd}([a-zA-Z0-9.]+)`, 'g'),
      (_, arg) => `${fn}(${arg})`
    );
  }

  // x^{...} or x^... → x^(...)
  s = s.replace(/([a-zA-Z0-9.]+)\s*\^\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, base, exp) => {
    return `${base}^(${latexToMeval(exp)})`;
  });
  s = s.replace(/([a-zA-Z0-9.]+)\s*\^\s*([a-zA-Z0-9.]+)/g, '$1^$2');

  // \cdot, \times → *
  s = s.replace(/\\cdot|\\times/g, '*');

  // 1\%5, 7\%3 등: LaTeX \% (숫자%숫자) → (a)/(b) (나머지 연산 대신 분수로 해석)
  s = s.replace(/(\d+(?:\.\d+)?)\\%(\d+(?:\.\d+)?)/g, (_, a, b) => `(${a})/(${b})`);

  // \pi → pi, \e → e (Euler)
  s = s.replace(/\\pi\b/g, 'pi');
  s = s.replace(/\\e\b/g, 'e');

  // Remove remaining backslashes from simple commands
  s = s.replace(/\\left|\\right/g, '');
  s = s.replace(/\\,|\\;|\\quad/g, ' ');
  // 남은 백슬래시 제거 (파싱 오류 방지)
  s = s.replace(/\\/g, '');

  return s.trim();
}

/**
 * Converts implicit equation f(x,y)=0 LaTeX to meval: (left)-(right).
 * e.g. "x^2+y^2-1=0" → "(x^2+y^2-1)-(0)", "x^2+y^2=1" → "(x^2+y^2)-(1)"
 */
export function latexToMevalImplicit(latex: string): string | null {
  if (!latex || !latex.trim()) return null;

  let s = latex.trim();
  s = s.replace(/^\s*\$\$?\s*|\s*\$\$?\s*$/g, '').trim();

  const parts = splitAtEquals(s);
  if (!parts) return null;

  const [left, right] = parts;
  const leftMeval = latexToMeval(left, false);
  const rightMeval = latexToMeval(right, false);

  return `(${leftMeval})-(${rightMeval})`;
}
