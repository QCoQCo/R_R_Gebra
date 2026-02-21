import { useGraphStore } from '../store/graphStore';
import { calculateGraph } from '../api';
import styles from './FormulaInput.module.scss';

export function FormulaInput() {
  const {
    formula,
    xMin,
    xMax,
    step,
    loading,
    setFormula,
    setRange,
    setPoints,
    setLoading,
    setError,
  } = useGraphStore();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formula.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const points = await calculateGraph({
        formula: formula.trim(),
        x_min: xMin,
        x_max: xMax,
        step,
      });
      setPoints(points);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.row}>
        <label htmlFor="formula">수식 (y = f(x))</label>
        <input
          id="formula"
          type="text"
          value={formula}
          onChange={(e) => setFormula(e.target.value)}
          placeholder="예: x^2, sin(x), x^2 + 2*x + 1"
          disabled={loading}
        />
      </div>
      <div className={styles.row}>
        <label htmlFor="xMin">x 최소</label>
        <input
          id="xMin"
          type="number"
          value={xMin}
          onChange={(e) => setRange(Number(e.target.value), xMax, step)}
          step="0.5"
          disabled={loading}
        />
        <label htmlFor="xMax">x 최대</label>
        <input
          id="xMax"
          type="number"
          value={xMax}
          onChange={(e) => setRange(xMin, Number(e.target.value), step)}
          step="0.5"
          disabled={loading}
        />
        <label htmlFor="step">간격</label>
        <input
          id="step"
          type="number"
          value={step}
          onChange={(e) => setRange(xMin, xMax, Number(e.target.value))}
          step="0.01"
          min="0.01"
          disabled={loading}
        />
      </div>
      <button type="submit" disabled={loading}>
        {loading ? '계산 중...' : '그래프 그리기'}
      </button>
    </form>
  );
}
