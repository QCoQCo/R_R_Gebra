import { Mafs, Coordinates, Plot, Theme } from 'mafs';
import { useGraphStore } from '../store/graphStore';
import type { Point } from '../store/graphStore';
import styles from './GraphCanvas.module.scss';

function interpolatePoints(points: Point[], t: number): [number, number] {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return [points[0].x, points[0].y];

  const n = points.length - 1;
  const idx = t * n;
  const i = Math.min(Math.floor(idx), n - 1);
  const frac = idx - i;
  const p0 = points[i];
  const p1 = points[i + 1];
  return [
    p0.x + frac * (p1.x - p0.x),
    p0.y + frac * (p1.y - p0.y),
  ];
}

export function GraphCanvas() {
  const { points, xMin, xMax } = useGraphStore();

  const yValues = points.map((p) => p.y).filter((y) => Number.isFinite(y));
  const yMin = yValues.length
    ? Math.min(...yValues) - 0.5
    : -5;
  const yMax = yValues.length
    ? Math.max(...yValues) + 0.5
    : 5;

  return (
    <div className={styles.canvas}>
      <Mafs
        viewBox={{ x: [xMin, xMax], y: [yMin, yMax] }}
        preserveAspectRatio="contain"
        zoom={{ min: 0.1, max: 10 }}
        pan={true}
      >
        <Coordinates.Cartesian subdivisions={4} />
        {points.length >= 2 && (
          <Plot.Parametric
            domain={[0, 1]}
            xy={(t) => interpolatePoints(points, t)}
            color={Theme.blue}
          />
        )}
      </Mafs>
    </div>
  );
}
