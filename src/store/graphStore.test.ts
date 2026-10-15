import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Point } from '../api';

vi.mock('../api', () => ({
  calculateGraph: vi.fn(),
  calculateImplicit: vi.fn(),
}));

import { calculateGraph, calculateImplicit } from '../api';
import { useGraphStore } from './graphStore';
import { DEFAULT_BOUNDS, IMPLICIT_CELLS_PER_VIEW, MAX_CACHE_ENTRIES, POINTS_PER_VIEW } from '../constants';

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
/** 구간 하나짜리 곡선 목록 */
const pts = (y: number): Point[][] => [
  [
    { x: 0, y },
    { x: 1, y },
  ],
];

beforeEach(() => {
  graphMock.mockReset();
  implicitMock.mockReset();
  store().reset();
});

describe('compute: 계산 범위', () => {
  it('auto 모드는 수동 범위가 아니라 현재 뷰포트(+ 양옆 25% 여유)를 계산한다', async () => {
    graphMock.mockResolvedValue(pts(1));
    store().setRange2D(-10, 10, -10, 10, 0.1);
    store().setViewportBounds({ xMin: 90, xMax: 110, yMin: -5, yMax: 5 });
    store().setExpression('x', 'explicit');

    await store().compute();

    expect(graphMock).toHaveBeenCalledWith({
      formula: 'x',
      x_min: 85,
      x_max: 115,
      // 샘플 간격은 여유를 뺀 화면 폭 기준
      step: 20 / POINTS_PER_VIEW,
    });
  });

  it('auto 모드에서 뷰포트를 아직 모르면 기본 범위를 쓴다', async () => {
    implicitMock.mockResolvedValue([]);
    store().setExpression('(x^(2)+y^(2))-(1)', 'implicit');

    await store().compute();

    const xPad = (DEFAULT_BOUNDS.xMax - DEFAULT_BOUNDS.xMin) / 4;
    const yPad = (DEFAULT_BOUNDS.yMax - DEFAULT_BOUNDS.yMin) / 4;
    expect(implicitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        x_min: DEFAULT_BOUNDS.xMin - xPad,
        x_max: DEFAULT_BOUNDS.xMax + xPad,
        y_min: DEFAULT_BOUNDS.yMin - yPad,
        y_max: DEFAULT_BOUNDS.yMax + yPad,
        // 화면 한 변 320칸 × (1 + 여유 0.25×2)
        grid_size: IMPLICIT_CELLS_PER_VIEW * 1.5,
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
    const first = deferred<Point[][]>();
    const second = deferred<Point[][]>();
    graphMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    store().setExpression('x', 'explicit');
    const run1 = store().compute();
    store().setExpression('x^(2)', 'explicit');
    const run2 = store().compute();

    second.resolve(pts(2));
    await run2;
    first.resolve(pts(1));
    await run1;

    expect(store().curves).toEqual(pts(2));
    expect(store().loading).toBe(false);
  });

  it('이전 요청의 오류도 최신 결과를 덮어쓰지 않는다', async () => {
    const first = deferred<Point[][]>();
    graphMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(pts(2));

    store().setExpression('x+', 'explicit');
    const run1 = store().compute();
    store().setExpression('x', 'explicit');
    await store().compute();
    first.reject('Invalid syntax');
    await run1;

    expect(store().error).toBeNull();
    expect(store().curves).toEqual(pts(2));
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
    expect(store().curves).toEqual(pts(1));
  });

  it('수식을 지우면 그래프를 비운다', async () => {
    graphMock.mockResolvedValue(pts(1));
    store().setExpression('x', 'explicit');
    await store().compute();

    store().setExpression('', 'explicit');
    await store().compute();

    expect(store().curves).toEqual([]);
    expect(graphMock).toHaveBeenCalledTimes(1);
  });
});

describe('compute: 캐시', () => {
  it('최근에 다시 쓴 항목은 오래된 항목보다 늦게 밀려난다 (LRU)', async () => {
    graphMock.mockImplementation(async ({ formula }) => pts(Number(formula)));
    const show = async (n: number) => {
      store().setExpression(String(n), 'explicit');
      await store().compute();
    };

    // 0 ~ MAX-1 을 채운 뒤 0 을 다시 쓰고, 새 항목 하나를 추가 → 1 이 밀려나야 함
    for (let n = 0; n < MAX_CACHE_ENTRIES; n++) await show(n);
    await show(0);
    await show(MAX_CACHE_ENTRIES);
    graphMock.mockClear();

    await show(0);
    expect(graphMock).not.toHaveBeenCalled();
    await show(1);
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
