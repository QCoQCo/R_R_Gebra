# R_R_Gebra

Tauri 기반 수학 그래프 앱 (GeoGebra 스타일). LaTeX 수식을 입력하면 Rust로 계산하고, mafs로 그래프를 그립니다.

## 실행

```bash
npm install
npm run tauri dev
```

## 지원 수식

**y = f(x)** 형태의 함수만 지원합니다. 변수는 `x`를 사용하세요.

### 지원 함수

| LaTeX | meval | 예시 |
|-------|-------|------|
| `\sin(x)`, `\cos(x)`, `\tan(x)` | sin, cos, tan | `sin(x) + cos(x)` |
| `\arcsin(x)`, `\arccos(x)`, `\arctan(x)` | asin, acos, atan | `arctan(x)` |
| `\sinh(x)`, `\cosh(x)`, `\tanh(x)` | sinh, cosh, tanh | `cosh(x)` |
| `\asinh(x)`, `\acosh(x)`, `\atanh(x)` | asinh, acosh, atanh | `tanh(x)` |
| `\ln(x)`, `\log(x)`, `\log_{10}(x)` | ln, log (상용로그) | `ln(x)`, `log(x)` |
| `\exp(x)` | exp | `exp(-x^2)` |
| `\sqrt{x}` | sqrt | `sqrt(x)` |
| `\frac{a}{b}` | (a)/(b) | `(x+1)/(x-1)` |
| `x^{n}`, `x^n` | x^(n) | `x^2`, `x^(1/2)` |
| `\pi`, `\e` | pi, e | `sin(pi*x)` |
| `\cdot`, `\times` | * | `x \cdot 2` |
| `\abs{x}` | abs | `abs(x)` |

### 미지원 (에러 메시지 표시)

- 적분 `\int`, `\iint`, `\oint`
- 합/곱 `\sum`, `\prod`
- 극한 `\lim`

### 모드

- **뷰포트 자동**: 줌/팬한 구간만 계산 (기본값)
- **수동 범위**: x 최소/최대/간격 직접 입력

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
