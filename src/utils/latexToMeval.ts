/** 지원하지 않는 LaTeX 기호. 적분, 합 등은 그래프에 사용 불가 */
const UNSUPPORTED_PATTERNS = [
  { pattern: /\\(?:int|iint|iiint|oint)(?![a-zA-Z])/, name: '적분(∫)' },
  { pattern: /\\(?:sum|prod)(?![a-zA-Z])/, name: '합/곱(∑∏)' },
  { pattern: /\\lim(?![a-zA-Z])/, name: '극한(lim)' },
];

export type FormulaType = 'explicit' | 'implicit';

/** 수식에 = 가 있고 "y =" 형태가 아니면 암시적 방정식 */
export function detectFormulaType(latex: string): FormulaType {
  const s = stripMathDelimiters(latex);
  if (!s.includes('=')) return 'explicit';
  if (/^\s*y\s*=/i.test(s)) return 'explicit';
  return 'implicit';
}

export function checkUnsupportedLatex(latex: string, _formulaType?: FormulaType): string | null {
  const s = stripMathDelimiters(latex);
  const hint = 'y = f(x) 또는 f(x,y) = 0 형태만 입력해 주세요.';
  for (const { pattern, name } of UNSUPPORTED_PATTERNS) {
    if (pattern.test(s)) return `${name}은(는) 지원하지 않습니다. ${hint}`;
  }
  return null;
}

/** $...$ / $$...$$ 래퍼 제거 */
function stripMathDelimiters(latex: string): string {
  return latex.trim().replace(/^\s*\$\$?\s*|\s*\$\$?\s*$/g, '').trim();
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

/** LaTeX 함수 명령 → meval 함수명 */
const LATEX_FUNCTIONS = new Map(Object.entries({
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  arcsin: 'asin',
  arccos: 'acos',
  arctan: 'atan',
  sinh: 'sinh',
  cosh: 'cosh',
  tanh: 'tanh',
  asinh: 'asinh',
  acosh: 'acosh',
  atanh: 'atanh',
  arsinh: 'asinh',
  arcosh: 'acosh',
  artanh: 'atanh',
  ln: 'ln',
  log: 'log',
  exp: 'exp',
  abs: 'abs',
}));

/** LaTeX 상수 명령 → meval 상수. \exponentialE 는 MathLive 가상 키보드의 e 키 출력 */
const LATEX_CONSTANTS = new Map(Object.entries({
  pi: 'pi',
  exponentialE: 'e',
  e: 'e',
}));

/** 공백 명령 (\, \; \quad 등) */
const LATEX_SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad']);

/** 인자 하나를 그대로 감싸는 서식 명령 (\operatorname{abs}, \mathrm{e} 등) */
const LATEX_WRAPPERS = new Set(['operatorname', 'mathrm', 'mathit', 'text', 'textrm']);

/** LaTeX 문자열 위를 움직이는 커서 */
class LatexReader {
  pos = 0;

  constructor(readonly src: string) {}

  get done(): boolean {
    return this.pos >= this.src.length;
  }

  peek(): string {
    return this.src[this.pos] ?? '';
  }

  skipSpaces(): void {
    while (!this.done && /\s/.test(this.peek())) this.pos++;
  }

  /** 현재 위치가 `\name` 이면 name 반환 (소비하지 않음) */
  peekCommand(): string | null {
    if (this.peek() !== '\\') return null;
    const m = /^[a-zA-Z]+/.exec(this.src.slice(this.pos + 1));
    return m ? m[0] : (this.src[this.pos + 1] ?? '');
  }

  /** `\name` 또는 `\,` 같은 한 글자 명령을 읽고 이름 반환. pos는 `\` 위치여야 함 */
  readCommand(): string {
    const name = this.peekCommand() ?? '';
    this.pos += 1 + name.length;
    return name;
  }

  /** pos의 여는 괄호부터 짝이 맞는 닫는 괄호까지 읽고 안쪽 내용 반환 */
  readBalanced(open: string, close: string): string {
    const start = ++this.pos;
    let depth = 1;
    while (!this.done) {
      const c = this.peek();
      if (c === '\\') {
        this.pos += 2; // \{ \} 같은 이스케이프는 깊이 계산에서 제외
        continue;
      }
      if (c === open) depth++;
      else if (c === close && --depth === 0) return this.src.slice(start, this.pos++);
      this.pos++;
    }
    return this.src.slice(start);
  }

  /** LaTeX 인자 하나: {group} 이면 안쪽 내용, 아니면 단일 문자 또는 단일 명령 */
  readArg(): string {
    this.skipSpaces();
    if (this.done) return '';
    if (this.peek() === '{') return this.readBalanced('{', '}');
    const start = this.pos;
    if (this.peek() === '\\') this.readCommand();
    else this.pos++;
    return this.src.slice(start, this.pos);
  }
}

/**
 * 파싱 전 정규화:
 * - \left( \right) \mleft \mright 제거 (구분자만 남김), \left. \right. 제거
 * - \vert \lvert \rvert \mid → |, \lbrack \rbrack \lparen \rparen → [ ] ( )
 * - |x| → \abs(x)
 * - 1\%5 → (1)/(5) (나머지 연산 대신 분수로 해석)
 */
function normalizeLatex(s: string): string {
  s = s.replace(/\\m?(?:left|right)\s*\./g, '');
  s = s.replace(/\\m?(?:left|right)(?![a-zA-Z])/g, '');
  s = s.replace(/\\(?:vert|lvert|rvert|mid)(?![a-zA-Z])/g, '|');
  s = s.replace(/\\([lr])(brack|paren)(?![a-zA-Z])/g, (_, side, kind) =>
    kind === 'brack' ? (side === 'l' ? '[' : ']') : side === 'l' ? '(' : ')'
  );
  s = s.replace(/(\d+(?:\.\d+)?)\\%(\d+(?:\.\d+)?)/g, (_, a, b) => `(${a})/(${b})`);
  return convertAbsBars(s);
}

/**
 * |...| 쌍을 \abs(...) 로 변환. 열린 | 가 없거나 직전 문자가 피연산자 끝이 아니면
 * 여는 막대, 그 외에는 닫는 막대로 본다. (|x|+|y|, ||x|-1| 모두 처리)
 */
function convertAbsBars(s: string): string {
  let out = '';
  let open = 0;
  let prevIsOperandEnd = false;
  for (const c of s) {
    if (c === '|') {
      if (open > 0 && prevIsOperandEnd) {
        out += ')';
        open--;
        prevIsOperandEnd = true;
      } else {
        out += '\\abs(';
        open++;
        prevIsOperandEnd = false;
      }
      continue;
    }
    out += c;
    if (!/\s/.test(c)) prevIsOperandEnd = /[a-zA-Z0-9.)}\]]/.test(c);
  }
  return out;
}

/** LaTeX → meval (암묵적 곱셈 삽입 전 단계). 그룹은 괄호로 감싼다 */
function convertLatex(src: string): string {
  const r = new LatexReader(src);
  let out = '';
  while (!r.done) {
    const c = r.peek();
    if (c === '\\') {
      out += convertCommand(r, r.readCommand());
    } else if (c === '{') {
      out += `(${convertLatex(r.readBalanced('{', '}'))})`;
    } else if (c === '^') {
      r.pos++;
      out += `^(${convertLatex(r.readArg())})`;
    } else if (c === '[') {
      out += '(';
      r.pos++;
    } else if (c === ']') {
      out += ')';
      r.pos++;
    } else {
      out += c;
      r.pos++;
    }
  }
  return out;
}

function convertCommand(r: LatexReader, name: string): string {
  if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
    const num = convertLatex(r.readArg());
    const den = convertLatex(r.readArg());
    return `(${num})/(${den})`;
  }
  if (name === 'sqrt') {
    r.skipSpaces();
    const index = r.peek() === '[' ? convertLatex(r.readBalanced('[', ']')) : null;
    const radicand = convertLatex(r.readArg());
    return index === null ? `sqrt(${radicand})` : `(${radicand})^(1/(${index}))`;
  }
  const fn = LATEX_FUNCTIONS.get(name);
  if (fn !== undefined) return convertFunction(r, fn);
  const constant = LATEX_CONSTANTS.get(name);
  if (constant !== undefined) return constant;
  if (LATEX_WRAPPERS.has(name)) {
    const inner = r.readArg();
    const wrappedFn = LATEX_FUNCTIONS.get(inner);
    return wrappedFn !== undefined ? convertFunction(r, wrappedFn) : convertLatex(inner);
  }
  if (name === 'cdot' || name === 'times') return '*';
  if (name === 'div') return '/';
  if (LATEX_SPACES.has(name)) return ' ';
  // 알 수 없는 명령은 백슬래시만 제거 (meval 에서 오류 메시지로 드러남)
  return name;
}

/**
 * 함수 호출 변환: \sin(x), \sin x, \sin^2 x, \log_2 x, \log_{10}(x) 등.
 */
function convertFunction(r: LatexReader, fn: string): string {
  let base: string | null = null;
  let power: string | null = null;
  for (;;) {
    r.skipSpaces();
    if (r.peek() === '_') {
      r.pos++;
      base = convertLatex(r.readArg());
    } else if (r.peek() === '^') {
      r.pos++;
      power = convertLatex(r.readArg());
    } else {
      break;
    }
  }

  const arg = readFunctionArgument(r);
  const call =
    fn === 'log' && base !== null && base !== '10'
      ? `(ln(${arg})/ln(${base}))`
      : `${fn}(${arg})`;
  return power === null ? call : `${call}^(${power})`;
}

/**
 * 함수 인자를 읽어 meval 로 변환.
 * - (…) / {…} → 괄호 안 전체
 * - \frac, \sqrt, \abs 등 명령 → 그 명령 하나
 * - 괄호 없음 → 연속된 숫자/문자/상수와 거듭제곱 (\sin 2x → sin(2x), \sin x^2 → sin(x^2))
 */
function readFunctionArgument(r: LatexReader): string {
  r.skipSpaces();
  while (LATEX_SPACES.has(r.peekCommand() ?? '')) {
    r.readCommand();
    r.skipSpaces();
  }
  const c = r.peek();
  if (c === '(') return convertLatex(r.readBalanced('(', ')'));
  if (c === '{') return convertLatex(r.readBalanced('{', '}'));

  const cmd = r.peekCommand();
  if (cmd !== null && !LATEX_CONSTANTS.has(cmd)) return convertCommand(r, r.readCommand());

  const start = r.pos;
  while (!r.done) {
    const ch = r.peek();
    const next = r.peekCommand();
    if (/[a-zA-Z0-9.]/.test(ch)) {
      r.pos++;
    } else if (ch === '^') {
      r.pos++;
      r.readArg();
    } else if (next !== null && LATEX_CONSTANTS.has(next)) {
      r.readCommand();
      r.skipSpaces(); // 명령 뒤 공백은 구분자일 뿐 (\sin\pi x → sin(pi x))
    } else {
      break;
    }
  }
  return convertLatex(r.src.slice(start, r.pos));
}

/** meval 내장 함수 (Context::new 기본값 + math_engine.rs 에서 추가한 log) */
const MEVAL_FUNCTIONS = new Set([
  'sqrt', 'exp', 'ln', 'log', 'abs',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'floor', 'ceil', 'round', 'signum', 'max', 'min',
]);

/** 문자열 안에서 식별자를 나눌 때 우선 매칭할 이름 (긴 이름 우선) */
const MEVAL_NAMES = [...MEVAL_FUNCTIONS, 'pi', 'e'].sort((a, b) => b.length - a.length);

type TokenKind = 'number' | 'name' | 'function' | 'symbol';

interface Token {
  kind: TokenKind;
  text: string;
}

/** 연속된 문자열을 알려진 함수/상수 이름과 한 글자 변수로 분리 (xsin → x, sin / xy → x, y) */
function splitIdentifier(run: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < run.length) {
    const text = MEVAL_NAMES.find((name) => run.startsWith(name, i)) ?? run[i];
    tokens.push({ kind: MEVAL_FUNCTIONS.has(text) ? 'function' : 'name', text });
    i += text.length;
  }
  return tokens;
}

function tokenizeMeval(expr: string): Token[] {
  const tokens: Token[] = [];
  for (const [text] of expr.matchAll(/\s+|\d+\.?\d*|\.\d+|[a-zA-Z]+|./g)) {
    if (/^\s/.test(text)) continue;
    if (/^[\d.]/.test(text)) tokens.push({ kind: 'number', text });
    else if (/^[a-zA-Z]/.test(text)) tokens.push(...splitIdentifier(text));
    else tokens.push({ kind: 'symbol', text });
  }
  return tokens;
}

function endsOperand(t: Token): boolean {
  return t.kind === 'number' || t.kind === 'name' || t.text === ')';
}

function startsOperand(t: Token): boolean {
  return t.kind !== 'symbol' || t.text === '(';
}

/** tokens[j] 부터 거듭제곱 지수 하나(괄호 묶음 또는 단일 토큰)가 끝나는 위치 */
function powerOperandEnd(tokens: Token[], j: number): number {
  if (tokens[j]?.text !== '(') return tokens[j] && tokens[j].kind !== 'symbol' ? j + 1 : j;
  let depth = 0;
  for (; j < tokens.length; j++) {
    if (tokens[j].text === '(') depth++;
    else if (tokens[j].text === ')' && --depth === 0) return j + 1;
  }
  return j;
}

/**
 * 괄호 없이 함수명 뒤에 붙은 인자를 감싼다: sinx → sin(x), sin2x → sin(2x), sinx^(2) → sin(x^(2)).
 * MathLive 에서 sin 이 \sin 으로 바뀌지 않고 글자 그대로 들어오는 경우 대비.
 */
function wrapBareFunctionArguments(tokens: Token[]): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i++];
    out.push(tok);
    if (tok.kind !== 'function' || tokens[i]?.text === '(') continue;
    const start = i;
    while (i < tokens.length && (tokens[i].kind === 'number' || tokens[i].kind === 'name')) i++;
    if (i === start) continue;
    if (tokens[i]?.text === '^') i = powerOperandEnd(tokens, i + 1);
    out.push({ kind: 'symbol', text: '(' }, ...tokens.slice(start, i), { kind: 'symbol', text: ')' });
  }
  return out;
}

/**
 * meval 은 암묵적 곱셈을 지원하지 않으므로 명시적 * 삽입.
 * 2x → 2*x, xy → x*y, x(x+1) → x*(x+1), sin(x)cos(x) → sin(x)*cos(x)
 */
function insertImplicitMultiplication(expr: string): string {
  let out = '';
  let prev: Token | null = null;
  for (const tok of wrapBareFunctionArguments(tokenizeMeval(expr))) {
    if (prev && endsOperand(prev) && startsOperand(tok)) out += '*';
    out += tok.text;
    prev = tok;
  }
  return out;
}

/**
 * Converts LaTeX (from MathLive) to meval-compatible expression.
 * Handles common math notation: sin, cos, sqrt, frac, powers, |x|, implicit multiplication, etc.
 * @param stripYPrefix - if true, removes "y = " prefix (for explicit y=f(x))
 */
export function latexToMeval(latex: string, stripYPrefix = true): string {
  if (!latex || !latex.trim()) return '';

  let s = stripMathDelimiters(latex);
  if (stripYPrefix) s = s.replace(/^\s*y\s*=\s*/i, '');

  return insertImplicitMultiplication(convertLatex(normalizeLatex(s)));
}

/**
 * Converts implicit equation f(x,y)=0 LaTeX to meval: (left)-(right).
 * e.g. "x^2+y^2-1=0" → "(x^(2)+y^(2)-1)-(0)", "x^2+y^2=1" → "(x^(2)+y^(2))-(1)"
 */
export function latexToMevalImplicit(latex: string): string | null {
  if (!latex || !latex.trim()) return null;

  const parts = splitAtEquals(stripMathDelimiters(latex));
  if (!parts) return null;

  const [left, right] = parts;
  const leftMeval = latexToMeval(left, false);
  const rightMeval = latexToMeval(right, false);

  return `(${leftMeval})-(${rightMeval})`;
}
