import { useEffect, useState } from 'react';

/**
 * Relógio da prévia no modelo: instante atual, tocar/pausar e ir para um instante.
 * Anda em tempo real (requestAnimationFrame) vezes `speed`; no fim para ou repete.
 */
export function usePreviewClock(total: number, speed = 1, loop = false) {
  const [time, setTimeState] = useState(0);
  const [playFrom, setPlayFrom] = useState<{ t0: number; at: number } | null>(null);

  useEffect(() => {
    if (!playFrom) return;
    let raf = 0;
    const tick = (now: number) => {
      const t = playFrom.t0 + ((now - playFrom.at) / 1000) * speed;
      if (t <= total) setTimeState(t);
      else if (loop && total > 0) setTimeState(t % total);
      else {
        setTimeState(total);
        setPlayFrom(null);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playFrom, total, speed, loop]);

  const clamped = Math.min(time, total);
  return {
    time: clamped,
    playing: playFrom !== null,
    toggle: () => (playFrom ? setPlayFrom(null) : setPlayFrom({ t0: clamped >= total ? 0 : clamped, at: performance.now() })),
    stop: () => setPlayFrom(null),
    /** vai para o instante t (e pausa) */
    seek: (t: number) => {
      setPlayFrom(null);
      setTimeState(Math.max(0, t));
    },
  };
}
