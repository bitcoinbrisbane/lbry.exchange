import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Calls `fn` now and every `intervalMs` while `enabled`, exposing the latest
 * result and a `refresh` to poll immediately (after a user action).
 */
export function usePolling(fn, intervalMs, enabled, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const alive = useRef(true);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fn();
      if (alive.current) {
        setData(result);
        setError(null);
        setUpdatedAt(Date.now());
      }
    } catch (err) {
      if (alive.current) setError(err.message || String(err));
    } finally {
      if (alive.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return undefined;
    run();
    const timer = setInterval(run, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [enabled, intervalMs, run]);

  return { data, error, loading, updatedAt, refresh: run };
}
