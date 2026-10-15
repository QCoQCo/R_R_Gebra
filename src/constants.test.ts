import { describe, expect, it } from 'vitest';
import { IMPLICIT_CELLS_PER_VIEW, POINTS_PER_VIEW, computeWindow } from './constants';

describe('computeWindow', () => {
  const view = { xMin: -16, xMax: 16, yMin: -8, yMax: 8 };

  it('auto: pads each side by 25% but keeps on-screen resolution', () => {
    const w = computeWindow(view, true);
    expect(w.bounds).toEqual({ xMin: -24, xMax: 24, yMin: -12, yMax: 12 });
    expect(w.step).toBe(32 / POINTS_PER_VIEW);
    // 화면 안 칸 수 = gridSize / 1.5 = 320
    expect(w.gridSize / 1.5).toBe(IMPLICIT_CELLS_PER_VIEW);
  });

  it('manual: uses the given range and step as is', () => {
    const w = computeWindow(view, false, 0.5);
    expect(w.bounds).toEqual(view);
    expect(w.step).toBe(0.5);
    expect(w.gridSize).toBe(IMPLICIT_CELLS_PER_VIEW);
  });

  it('grid density does not depend on zoom (old: 80 cells when zoomed in)', () => {
    const zoomedIn = computeWindow({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 }, true);
    const zoomedOut = computeWindow({ xMin: -500, xMax: 500, yMin: -500, yMax: 500 }, true);
    expect(zoomedIn.gridSize).toBe(zoomedOut.gridSize);
  });
});
