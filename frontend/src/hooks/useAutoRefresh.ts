import { useCallback, useEffect, useRef, useState } from 'react';

export function useAutoRefresh(
  refreshFn: () => Promise<void> | void,
  intervalMs: number,
  enabled: boolean,
) {
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshRef = useRef(refreshFn);
  refreshRef.current = refreshFn;

  const refreshNow = useCallback(async () => {
    await refreshRef.current();
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(async () => {
      try {
        await refreshRef.current();
        setLastRefresh(new Date());
      } catch { /* silently retry next tick */ }
    }, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);

  return { lastRefresh, refreshNow };
}
