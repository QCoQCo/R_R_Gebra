import { useEffect, useState } from 'react';

/** value 가 delayMs 동안 바뀌지 않으면 그 값을 돌려준다 (연속 입력 중에는 이전 값 유지) */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
