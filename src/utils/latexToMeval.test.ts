import { describe, expect, it } from 'vitest';
import {
  checkUnsupportedLatex,
  detectFormulaType,
  latexToMeval,
  latexToMevalImplicit,
} from './latexToMeval';

describe('latexToMeval', () => {
  it.each([
    // 기본
    ['x', 'x'],
    ['y=x^2', 'x^(2)'],
    ['$$x^{2}+1$$', 'x^(2)+1'],
    // 함수: 괄호/괄호 없음/거듭제곱
    ['\\sin\\left(x\\right)', 'sin(x)'],
    ['\\sin x', 'sin(x)'],
    ['\\sin 2x', 'sin(2*x)'],
    ['\\sin x^{2}', 'sin(x^(2))'],
    ['\\sin^2x', 'sin(x)^(2)'],
    ['\\sin\\,x', 'sin(x)'],
    ['\\sin\\pi x', 'sin(pi*x)'],
    ['\\sin x\\cos x', 'sin(x)*cos(x)'],
    ['\\arcsin(x)', 'asin(x)'],
    ['\\exp(x)', 'exp(x)'],
    ['\\ln x', 'ln(x)'],
    // 쌍곡선 함수: \sin 규칙이 \sinh 를 먹으면 안 됨
    ['\\sinh\\left(x\\right)', 'sinh(x)'],
    ['\\cosh(x)', 'cosh(x)'],
    ['\\tanh x', 'tanh(x)'],
    // 로그 밑
    ['\\log(x)', 'log(x)'],
    ['\\log_{10}(x)', 'log(x)'],
    ['\\log_2 x', '(ln(x)/ln(2))'],
    // 암묵적 곱셈
    ['2x+1', '2*x+1'],
    ['2.5x', '2.5*x'],
    ['x\\sin x', 'x*sin(x)'],
    ['2\\pi x', '2*pi*x'],
    ['x(x+1)', 'x*(x+1)'],
    ['\\left(x+1\\right)\\left(x-1\\right)', '(x+1)*(x-1)'],
    ['x\\cdot2', 'x*2'],
    ['3\\times x', '3*x'],
    // 절댓값
    ['\\left|x\\right|', 'abs(x)'],
    ['\\left\\vert x\\right\\vert', 'abs(x)'],
    ['|x|+|y|', 'abs(x)+abs(y)'],
    ['||x|-1|', 'abs(abs(x)-1)'],
    ['\\sin|x|', 'sin(abs(x))'],
    ['\\operatorname{abs}(x)', 'abs(x)'],
    // 분수/근호: 중첩 중괄호
    ['\\frac{1}{x}', '(1)/(x)'],
    ['\\frac{1}{\\sqrt{x^{2}+1}}', '(1)/(sqrt(x^(2)+1))'],
    ['\\frac{\\frac{1}{x}}{2}', '((1)/(x))/(2)'],
    ['\\frac12', '(1)/(2)'],
    ['\\sqrt{x}', 'sqrt(x)'],
    ['\\sqrt[3]{x}', '(x)^(1/(3))'],
    // 상수
    ['\\exponentialE^{x}', 'e^(x)'],
    ['e^x', 'e^(x)'],
    // 괄호 변형
    ['\\mleft(x\\mright)^{2}', '(x)^(2)'],
    ['\\left\\lbrack x\\right\\rbrack', '(x)'],
    // MathLive 가 \sin 대신 글자 그대로 넘기는 경우
    ['sinx', 'sin(x)'],
    ['xsinx', 'x*sin(x)'],
    ['sin2x', 'sin(2*x)'],
    ['sinx^2', 'sin(x^(2))'],
    ['sinxcosx', 'sin(x)*cos(x)'],
    ['sinh(x)', 'sinh(x)'],
    ['sqrt(x)+e^{x}', 'sqrt(x)+e^(x)'],
    ['2pix', '2*pi*x'],
    // % 는 퍼센트(÷100), 바로 앞 피연산자에만 붙음 (GeoGebra 와 같음)
    ['50\\%', '(50/100)'],
    ['30\\%600', '(30/100)*600'],
    ['x+50\\%', 'x+(50/100)'],
    ['x/50\\%', 'x/(50/100)'],
    ['\\left(x+1\\right)\\%', '((x+1)/100)'],
    ['\\sin(x)\\%', '(sin(x)/100)'],
    // 나머지 연산
    ['mod(x,3)', 'mod(x,3)'],
    ['\\operatorname{mod}\\left(x,2\\right)', 'mod(x,2)'],
    ['2mod(x,3)', '2*mod(x,3)'],
    // GeoGebra 식 함수 표기
    ['f(x)=x^2', 'x^(2)'],
    ['f\\left(x\\right)=\\sin x', 'sin(x)'],
    ['g(x) = 2x', '2*x'],
  ])('%s → %s', (latex, expected) => {
    expect(latexToMeval(latex)).toBe(expected);
  });

  it('returns empty string for blank input', () => {
    expect(latexToMeval('')).toBe('');
    expect(latexToMeval('   ')).toBe('');
  });
});

describe('latexToMevalImplicit', () => {
  it.each([
    ['x^2+y^2=1', '(x^(2)+y^(2))-(1)'],
    ['xy=1', '(x*y)-(1)'],
    ['\\left(x^2+y^2-1\\right)^3-x^2y^3=0', '((x^(2)+y^(2)-1)^(3)-x^(2)*y^(3))-(0)'],
    ['\\sin x=\\cos y', '(sin(x))-(cos(y))'],
    ['|x|+|y|=1', '(abs(x)+abs(y))-(1)'],
  ])('%s → %s', (latex, expected) => {
    expect(latexToMevalImplicit(latex)).toBe(expected);
  });

  it('treats an expression without "=" as expression = 0', () => {
    expect(latexToMevalImplicit('x^2+y^2-1')).toBe('(x^(2)+y^(2)-1)-(0)');
  });

  it('returns null for blank input', () => {
    expect(latexToMevalImplicit('  ')).toBeNull();
  });
});

describe('detectFormulaType', () => {
  it.each([
    ['x^2', 'explicit'],
    ['y=x^2', 'explicit'],
    ['x^2+y^2=1', 'implicit'],
    ['xy=1', 'implicit'],
    // f(x) = … 는 y = … 와 같음
    ['f(x)=x^2', 'explicit'],
    ['g\\left(x\\right)=\\sin x', 'explicit'],
    // = 가 없어도 y 를 쓰면 식 = 0
    ['x^2+y^2-1', 'implicit'],
    ['xy-1', 'implicit'],
    ['\\sin x', 'explicit'],
    ['\\left|y\\right|', 'implicit'],
  ])('%s → %s', (latex, expected) => {
    expect(detectFormulaType(latex)).toBe(expected);
  });
});

describe('checkUnsupportedLatex', () => {
  it('detects unsupported symbols on repeated calls', () => {
    // 전역(g) 플래그 정규식의 lastIndex 가 남아 두 번째 호출에서 놓치던 문제 방지
    expect(checkUnsupportedLatex('\\int x')).not.toBeNull();
    expect(checkUnsupportedLatex('\\int x')).not.toBeNull();
    // \b 는 _ 앞에서 경계로 인식되지 않아 \sum_{…}, \int_0^1 을 놓치던 문제 방지
    expect(checkUnsupportedLatex('\\sum_{n=1}^{10} x')).not.toBeNull();
    expect(checkUnsupportedLatex('\\int_{0}^{1} x')).not.toBeNull();
    expect(checkUnsupportedLatex('x^2')).toBeNull();
  });
});
