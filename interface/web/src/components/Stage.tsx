import { useCallback, useEffect, useState, type RefObject } from 'react';
import { toast } from 'sonner';

/** Classes do painel de vidro que fica por cima do canvas (HUD). */
export const glass = 'glass rounded-xl border border-border shadow-xl';

/** Palco em tela inteira sob o cabeçalho: compensa o padding do <main>. */
export const stageClass = 'relative -mx-4 -my-5 h-[calc(100dvh-57px)] min-h-[36rem] overflow-hidden bg-bg sm:-mx-6 lg:-mx-8';

/** Tela cheia de um elemento (Fullscreen API), com o estado sincronizado. */
export function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const on = () => setActive(document.fullscreenElement === target.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, [target]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void target.current?.requestFullscreen?.().catch(() => toast.error('O navegador não permitiu a tela cheia.'));
  }, [target]);
  return [active, toggle] as const;
}

/** Cor de fundo da cena 3D, lida dos tokens do tema atual. */
export function sceneBackground() {
  return getComputedStyle(document.documentElement).getPropertyValue('--c-scene-bg').trim() || '#101010';
}
