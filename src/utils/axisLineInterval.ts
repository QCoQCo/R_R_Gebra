/** 라벨 사이 최소 간격(px). 기본 화면(-13~13)에서 1 단위 눈금이 되는 값 */
const MIN_LABEL_GAP_PX = 28;

/** 라벨 한 글자의 대략적인 폭(px). 긴 라벨(1000000, 0.0005)끼리 겹치지 않게 간격을 늘리는 데 사용 */
const LABEL_CHAR_WIDTH_PX = 8;

/** raw 이상인 가장 작은 1·2·5 × 10ⁿ */
function niceStep(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * 축 눈금(라벨) 간격. 1·2·5 × 10ⁿ 중 라벨끼리 겹치지 않는 가장 촘촘한 값.
 * Mafs 는 눈금마다 라벨 <text> 를 만들므로, 간격이 화면 배율과 무관하게 고정이면
 * 수동 범위 ±1e9 에서 라벨이 수억 개 생겨 화면이 멈춘다. 배율에 비례시켜 개수를 일정하게 유지.
 * @param pxPerUnit 현재 확대 상태의 단위당 픽셀
 * @param maxAbsValue 화면에 보이는 좌표의 최대 절댓값 (라벨 글자 수 추정용)
 */
export function axisLineInterval(pxPerUnit: number, maxAbsValue: number): number {
  if (!Number.isFinite(pxPerUnit) || pxPerUnit <= 0) return 1;
  let interval = niceStep(MIN_LABEL_GAP_PX / pxPerUnit);
  // 라벨이 길면 한두 단계 더 벌림 (간격이 바뀌면 라벨 길이도 바뀌므로 몇 번 반복)
  for (let i = 0; i < 3; i++) {
    const longest = Math.max(
      formatAxisLabel(maxAbsValue, interval).length,
      formatAxisLabel(interval, interval).length
    );
    const needed = niceStep(((longest + 1) * LABEL_CHAR_WIDTH_PX) / pxPerUnit); // +1: 음수 부호
    if (needed <= interval) break;
    interval = needed;
  }
  return interval;
}

/**
 * 축 라벨 문자열. Mafs 는 눈금 값을 간격을 계속 더해 만들기 때문에(0.2 + 0.2 + … )
 * 0.6000000000000001 같은 부동소수점 오차가 그대로 찍힌다. 간격의 소수 자릿수로 반올림해 표시.
 */
export function formatAxisLabel(value: number, interval: number): string {
  const decimals =
    Number.isFinite(interval) && interval > 0
      ? Math.min(20, Math.max(0, -Math.floor(Math.log10(interval))))
      : 0;
  const rounded = Number(value.toFixed(decimals));
  return String(rounded === 0 ? 0 : rounded); // -0 → 0
}
