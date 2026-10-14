import { describe, expect, it } from 'vitest';
import { axisLineInterval, formatAxisLabel } from './axisLineInterval';

describe('axisLineInterval', () => {
  it.each([
    // [단위당 px, 보이는 좌표 최대 절댓값, 기대 간격]
    [28.5, 16, 1], // 기본 화면 (-13~13 을 740px 에): 예전처럼 1 단위
    [57, 8, 1], // 2배 확대: 0.5 간격(28.5px)은 "-1.5" 라벨(≈32px)에 좁아서 1 유지
    [85, 5, 0.5], // 3배 확대
    [285, 2, 0.2], // 최대 확대(10배): 0.1 이면 "0.1" 라벨끼리 겹쳐서 0.2
    [3.7e-7, 1e9, 5e8], // 수동 범위 ±1e9
  ])('%d px/unit, max %d → %d', (pxPerUnit, maxAbs, expected) => {
    expect(axisLineInterval(pxPerUnit, maxAbs)).toBeCloseTo(expected);
  });

  it('keeps labels apart and their count bounded at any zoom', () => {
    const width = 740;
    for (const span of [0.001, 0.3, 2.6, 26, 3000, 2e6, 2e9, 1e15]) {
      const pxPerUnit = width / span;
      const maxAbs = span / 2;
      const interval = axisLineInterval(pxPerUnit, maxAbs);
      const gapPx = interval * pxPerUnit;
      const longest = formatAxisLabel(-maxAbs, interval).length;
      expect(gapPx).toBeGreaterThanOrEqual(28);
      expect(gapPx).toBeGreaterThanOrEqual(longest * 8);
      expect(span / interval).toBeLessThanOrEqual(width / 28);
    }
  });

  it('falls back to 1 for an invalid scale', () => {
    expect(axisLineInterval(0, 10)).toBe(1);
    expect(axisLineInterval(-5, 10)).toBe(1);
    expect(axisLineInterval(NaN, 10)).toBe(1);
    expect(axisLineInterval(Infinity, 10)).toBe(1);
  });
});

describe('formatAxisLabel', () => {
  it('hides floating point drift from accumulated ticks', () => {
    // Mafs 가 -1.2 부터 0.2 씩 더해 만드는 값들
    const ticks: number[] = [];
    for (let v = -1.2; v < 1.1; v += 0.2) ticks.push(v);
    expect(ticks.map((v) => formatAxisLabel(v, 0.2))).toEqual([
      '-1.2', '-1', '-0.8', '-0.6', '-0.4', '-0.2', '0', '0.2', '0.4', '0.6', '0.8', '1',
    ]);
  });

  it.each([
    [0.30000000000000004, 0.1, '0.3'],
    [0.15000000000000002, 0.05, '0.15'],
    [0.0006000000000000001, 0.0002, '0.0006'],
    [2000000000, 100000000, '2000000000'],
    [-15, 5, '-15'],
  ])('%d (interval %d) → %s', (value, interval, expected) => {
    expect(formatAxisLabel(value, interval)).toBe(expected);
  });
});
