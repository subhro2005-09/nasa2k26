import { useEffect, useRef, useState } from 'react';

/** Smooth telemetry jumps (route change) without lagging 80 ms walk ticks. */
export function useTween(value, { duration = 520, snapBelow = 0 } = {}) {
  const [shown, setShown] = useState(value || 0);
  const shownRef = useRef(value || 0);
  useEffect(() => {
    const next = Number(value) || 0;
    const from = shownRef.current;
    if (Math.abs(next - from) <= snapBelow) {
      shownRef.current = next;
      setShown(next);
      return undefined;
    }
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - (1 - t) ** 3;
      const v = from + (next - from) * e;
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, snapBelow]);
  return shown;
}
