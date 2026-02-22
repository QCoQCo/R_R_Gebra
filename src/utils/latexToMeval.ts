/** 지원하지 않는 LaTeX 기호. 적분, 합 등은 y=f(x) 그래프에 사용 불가 */
const UNSUPPORTED_PATTERNS = [
  { pattern: /\\int\b|\\iint|\\iiint|\\oint/g, name: '적분(∫)' },
  { pattern: /\\sum\b|\\prod\b/g, name: '합/곱(∑∏)' },
  { pattern: /\\lim\b/g, name: '극한(lim)' },
];

export function checkUnsupportedLatex(latex: string): string | null {
  const s = latex.trim().replace(/^\s*\$\$?\s*|\s*\$\$?\s*$/g, '').trim();
  for (const { pattern, name } of UNSUPPORTED_PATTERNS) {
    if (pattern.test(s)) return `${name}은(는) 지원하지 않습니다. y = f(x) 형태의 함수만 입력해 주세요.`;
  }
  return null;
}

/**
 * Converts LaTeX (from MathLive) to meval-compatible expression.
 * Handles common math notation: sin, cos, sqrt, frac, powers, etc.
 */
export function latexToMeval(latex: string): string {
  if (!latex || !latex.trim()) return '';

  let s = latex.trim();

  // Remove $$ or $ wrappers
  s = s.replace(/^\s*\$\$?\s*|\s*\$\$?\s*$/g, '').trim();
  // Remove optional "y = " or "y=" prefix
  s = s.replace(/^\s*y\s*=\s*/i, '').trim();

  // \log_{10}(x) → \log(x) (상용로그)
  s = s.replace(/\\log_{10}/g, '\\log');

  // \frac{a}{b} → (a)/(b) - handle nested braces
  s = s.replace(/\\frac\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, a, b) => {
    return `(${latexToMeval(a)})/(${latexToMeval(b)})`;
  });

  // \sqrt{x} → sqrt(x)
  s = s.replace(/\\sqrt\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, (_, x) => {
    return `sqrt(${latexToMeval(x)})`;
  });

  // \sin(x), \sin{x}, \sin\left(x\right), \log x (괄호 없음)
  const funcs = ['sin', 'cos', 'tan', 'ln', 'log', 'exp', 'abs'];
  for (const fn of funcs) {
    const cmd = `\\\\${fn}`;
    // \sin\left(x\right) or \sin(x) or \sin{x}
    s = s.replace(
      new RegExp(`${cmd}\\s*\\\\left\\(([^)]*)\\\\\\right\\)`, 'g'),
      (_, arg) => `${fn}(${latexToMeval(arg)})`
    );
    s = s.replace(
      new RegExp(`${cmd}\\s*\\(([^)]*)\\)`, 'g'),
      (_, arg) => `${fn}(${latexToMeval(arg)})`
    );
    s = s.replace(
      new RegExp(`${cmd}\\s*\\{([^{}]*(?:\\{[^{}]*\\}[^{}]*)*)\\}`, 'g'),
      (_, arg) => `${fn}(${latexToMeval(arg)})`
    );
    // \log x, \ln x (공백으로 구분)
    s = s.replace(
      new RegExp(`${cmd}\\s+([a-zA-Z0-9.]+)`, 'g'),
      (_, arg) => `${fn}(${arg})`
    );
    // \log2, \ln2 (공백 없이 바로 붙은 경우)
    s = s.replace(
      new RegExp(`${cmd}([a-zA-Z0-9.]+)`, 'g'),
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
