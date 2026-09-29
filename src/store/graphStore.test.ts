import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Point } from '../api';

vi.mock('../api', () => ({
  calculateGraph: vi.fn(),
  calculateImplicit: vi.fn(),
}));

import { calculateGraph, calculateImplicit } from '../api';
import { useGraphStore } from './graphStore';
import { DEFAULT_BOUNDS, POINTS_PER_VIEW } from '../constants';

const graphMock = vi.mocked(calculateGraph);
const implicitMock = vi.mocked(calculateImplicit);

/** 테스트에서 직접 resolve 할 수 있는 Promise */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const store = () => useGraphStore.getState();
const pts = (y: number): Point[] => [
  { x: 0, y },
  { x: 1, y },
];

beforeEach(() => {
  graphMock.mockReset();
  implicitMock.mockReset();
  store().reset();
});

describe('compute: 계산 범위', () => {
  it('auto 모드는 수동 범위가 아니라 현재 뷰포트를 계산한다', async () => {
    graphMock.mockResolvedValue(pts(1));
    store().setRange2D(-10, 10, -10, 10, 0.1);
    store().setViewportBounds({ xMin: 90, xMax: 110, yMin: -5, yMax: 5 });
    store().setExpression('x', 'explicit');

    await store().compute();

    expect(graphMock).toHaveBeenCalledWith({
      formula: 'x',
      x_min: 90,
      x_max: 110,
      step: 20 / POINTS_PER_VIEW,
    });
  });

  it('auto 모드에서 뷰포트를 아직 모르면 기본 범위를 쓴다', async () => {
    implicitMock.mockResolvedValue([]);
    store().setExpression('(x^(2)+y^(2))-(1)', 'implicit');

    await store().compute();

    expect(implicitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        x_min: DEFAULT_BOUNDS.xMin,
        x_max: DEFAULT_BOUNDS.xMax,
        y_min: DEFAULT_BOUNDS.yMin,
        y_max: DEFAULT_BOUNDS.yMax,
      })
    );
  });

  it('manual 모드는 입력한 범위와 간격을 쓴다', async () => {
    graphMock.mockResolvedValue(pts(1));
    store().setViewportBounds({ xMin: 90, xMax: 110, yMin: -5, yMax: 5 });
    store().setViewportMode('manual');
    store().setRange2D(-3, 3, -2, 2, 0.5);
    store().setExpression('x', 'explicit');

    await store().compute();

    expect(graphMock).toHaveBeenCalledWith({ formula: 'x', x_min: -3, x_max: 3, step: 0.5 });
  });
});

describe('compute: 결과 반영', () => {
  it('늦게 도착한 이전 요청의 결과는 버린다', async () => {
    const first = deferred<Point[]>();
    const second = deferred<Point[]>();
    graphMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store().setExpression('x', 'explicit');
    const run1 = store().compute();
    store().setExpression('x^(2)', 'explicit');
    const run2 = store().compute();

    second.resolve(pts(2));
    await run2;
    first.resolve(pts(1));
    await run1;

    expect(store().points).toEqual(pts(2));
    expect(store().loading).toBe(false);
  });

  it('이전 요청의 오류도 최신 결과를 덮어쓰지 않는다', async () => {
    const first = deferred<Point[]>();
    graphMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(pts(2));

    store().setExpression('x+', 'explicit');
    const run1 = store().compute();
    store().setExpression('x', 'explicit');
    await store().compute();
    first.reject('Invalid syntax');
    await run1;

    expect(store().error).toBeNull();
    expect(store().points).toEqual(pts(2));
  });

  it('최신 요청의 오류는 표시하고 로딩을 끝낸다', async () => {
    graphMock.mockRejectedValue('Invalid syntax: x+');
    store().setExpression('x+', 'explicit');

    await store().compute();

    expect(store().error).toBe('Invalid syntax: x+');
    expect(store().loading).toBe(false);
  });

  it('같은 요청은 캐시에서 가져온다', async () => {
    graphMock.mockResolvedValue(pts(1));
    store().setExpression('x', 'explicit');

    await store().compute();
    await store().compute();

    expect(graphMock).toHaveBeenCalledTimes(1);
    expect(store().points).toEqual(pts(1));
  });

  it('수식을 지우면 그래프를 비운다', async () => {
    graphMock.mockResolvedValue(pts(1));
    store().setExpression('x', 'explicit');
    await store().compute();

    store().setExpression('', 'explicit');
    await store().compute();

    expect(store().points).toEqual([]);
    expect(store().implicitCurves).toEqual([]);
    expect(graphMock).toHaveBeenCalledTimes(1);
  });
});

describe('submitExpression', () => {
  it('수식이 같아도 재계산 토큰을 올린다', () => {
    store().setExpression('x', 'explicit');
    const before = store().recomputeToken;

    store().submitExpression('x', 'explicit');

    expect(store().recomputeToken).toBe(before + 1);
    expect(store().formula).toBe('x');
  });
});
