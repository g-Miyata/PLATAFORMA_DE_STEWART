import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { PlatformResponse, Pose } from '@/lib/types';

/**
 * Valida a pose no backend (autoridade), com debounce: o 3D já responde na hora
 * pela cinemática local, e este resultado confirma o que seria aplicado.
 */
export function useBackendValidation(pose: Pose, delayMs = 120) {
  const [state, setState] = useState<{ for: Pose | null; result: PlatformResponse | null; error: string | null }>({
    for: null,
    result: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const result = await api.calculate(pose);
        if (!cancelled) setState({ for: pose, result, error: null });
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, for: pose, error: (err as Error).message }));
      }
    }, delayMs);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [pose, delayMs]);

  return { result: state.result, error: state.error, pending: state.for !== pose };
}
