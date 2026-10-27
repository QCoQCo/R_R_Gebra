import { describe, expect, it } from 'vitest';
import { friendlyError } from './friendlyError';

describe('friendlyError', () => {
  // 원문은 math_engine.rs 에 실제 입력을 넣어 받은 오류 문자열
  it.each([
    ['Invalid syntax: Parse error: Missing 1 right parenthesis.', '닫는 괄호가 1개 부족합니다.'],
    [
      'Invalid syntax: Parse error: Missing argument at the end of expression.',
      '수식이 연산자로 끝났습니다. 뒤에 올 값을 입력해 주세요.',
    ],
    [
      'Invalid syntax: Parse error: Unexpected token at byte 1.',
      '수식을 해석할 수 없습니다. 괄호와 연산자를 확인해 주세요.',
    ],
    [
      "Invalid expression (use 'x' as variable): Evaluation error: unknown variable `z`.",
      "알 수 없는 변수 'z'입니다. y = f(x) 그래프에는 변수 x 만 쓸 수 있습니다.",
    ],
    [
      "Invalid expression (use 'x' and 'y' as variables): Evaluation error: unknown variable `z`.",
      "알 수 없는 변수 'z'입니다. 방정식에는 변수 x 와 y 만 쓸 수 있습니다.",
    ],
    [
      "Invalid expression (use 'x' as variable): Evaluation error: function `foo`: Unknown function",
      "지원하지 않는 함수 'foo'입니다.",
    ],
    [
      "Invalid expression (use 'x' as variable): Evaluation error: function `mod`: Expected 2 arguments",
      "함수 'mod'에는 값이 2개 필요합니다. 예: mod(x, 3)",
    ],
    ['Formula cannot be empty', '수식을 입력해 주세요.'],
    ['x_min must be less than x_max', '범위의 최소값이 최대값보다 작아야 합니다.'],
    ['x_min < x_max and y_min < y_max required', '범위의 최소값이 최대값보다 작아야 합니다.'],
    ['Step must be positive', '간격은 0보다 커야 합니다.'],
    [
      'Too many points: (x_max - x_min) / step = 200000000000 exceeds 100000 (increase step or narrow the range)',
      '계산할 점이 너무 많습니다 (200,000,000,000개, 최대 100,000개). 간격을 늘리거나 범위를 줄여 주세요.',
    ],
    ['x, y range must be finite', '범위에 올바른 숫자를 입력해 주세요.'],
    ['grid_size must be at most 1024', '격자 크기가 허용 범위를 벗어났습니다.'],
  ])('%s', (raw, expected) => {
    expect(friendlyError(raw)).toBe(expected);
  });

  it('keeps the original text for unknown errors', () => {
    expect(friendlyError('something exploded')).toBe('계산 중 오류가 발생했습니다: something exploded');
  });
});
