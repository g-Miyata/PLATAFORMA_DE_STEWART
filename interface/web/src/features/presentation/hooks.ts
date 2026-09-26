import { useEffect, useState } from 'react';

/** Mantém a tela acesa enquanto `active` (Wake Lock API, quando disponível). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined);
    void request();
    const onVisible = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [active]);
}

/** Esconde o cursor depois de alguns segundos parado. */
export function useIdleCursor(active: boolean, ms = 3000) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!active) return;
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), ms);
    };
    wake();
    window.addEventListener('pointermove', wake);
    window.addEventListener('keydown', wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('keydown', wake);
    };
  }, [active, ms]);
  return active && idle;
}

export function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
