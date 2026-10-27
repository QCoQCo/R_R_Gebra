const SYNTAX_HINT = '수식을 해석할 수 없습니다. 괄호와 연산자를 확인해 주세요.';

const formatCount = (digits: string) => Number(digits).toLocaleString('ko-KR');

/**
 * 계산 엔진(math_engine.rs / meval)의 오류 문자열 → 사용자용 한국어 안내.
 * 위에서부터 처음 맞는 규칙을 쓴다 (구체적인 규칙을 앞에).
 */
const RULES: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
  // 문법
  [/Missing (\d+) right parenthes/, (m) => `닫는 괄호가 ${m[1]}개 부족합니다.`],
  [/Missing argument at the end/, () => '수식이 연산자로 끝났습니다. 뒤에 올 값을 입력해 주세요.'],
  [/^Invalid syntax/, () => SYNTAX_HINT],
  // 변수·함수
  [
    /use 'x' as variable\).*unknown variable `(.+?)`/,
    (m) => `알 수 없는 변수 '${m[1]}'입니다. y = f(x) 그래프에는 변수 x 만 쓸 수 있습니다.`,
  ],
  [
    /unknown variable `(.+?)`/,
    (m) => `알 수 없는 변수 '${m[1]}'입니다. 방정식에는 변수 x 와 y 만 쓸 수 있습니다.`,
  ],
  [/function `(.+?)`: Unknown function/, (m) => `지원하지 않는 함수 '${m[1]}'입니다.`],
  [
    /function `(.+?)`: Expected (\d+) argument/,
    (m) => `함수 '${m[1]}'에는 값이 ${m[2]}개 필요합니다. 예: mod(x, 3)`,
  ],
  // 입력값·범위
  [/Formula cannot be empty/, () => '수식을 입력해 주세요.'],
  [/x_min must be less than x_max|x_min < x_max and y_min < y_max/, () => '범위의 최소값이 최대값보다 작아야 합니다.'],
  [/Step must be positive/, () => '간격은 0보다 커야 합니다.'],
  [
    /Too many points: .*= (\d+) exceeds (\d+)/,
    (m) =>
      `계산할 점이 너무 많습니다 (${formatCount(m[1])}개, 최대 ${formatCount(m[2])}개). 간격을 늘리거나 범위를 줄여 주세요.`,
  ],
  [/range must be finite/, () => '범위에 올바른 숫자를 입력해 주세요.'],
  [/grid_size/, () => '격자 크기가 허용 범위를 벗어났습니다.'],
];

/** 알려진 오류는 한국어 안내로, 모르는 오류는 원문을 덧붙여 반환 */
export function friendlyError(raw: string): string {
  for (const [pattern, message] of RULES) {
    const m = raw.match(pattern);
    if (m) return message(m);
  }
  return `계산 중 오류가 발생했습니다: ${raw}`;
}
