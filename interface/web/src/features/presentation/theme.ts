import type { CSSProperties } from 'react';
import type { Theme } from '@/stores/ui';

/** O que a tela de exposição mostra: o show de cenas ou o simulador de voo (motion cueing). */
export type ExhibitMode = 'show' | 'voo';

/**
 * Cores da tela de exposição nos dois temas. O HUD usa as variáveis --ex-* (definidas
 * no palco), e a cena 3D recebe as cores direto.
 */
export interface ExhibitPalette {
  dark: boolean;
  /** fundo da cena e névoa */
  bg: string;
  /** piso com reflexo */
  floor: string;
  /** variáveis CSS do HUD */
  vars: CSSProperties;
  /** degradês que dão leitura ao texto sobre o 3D */
  scrim: string;
  scrimTop: string;
  logo: string;
}

export function exhibitPalette(theme: Theme): ExhibitPalette {
  if (theme === 'light')
    return {
      dark: false,
      bg: '#e8eee9',
      floor: '#d3dbd5',
      vars: {
        '--ex-text': '#0f1613',
        '--ex-muted': 'rgb(15 22 19 / 0.75)',
        '--ex-panel': 'rgb(255 255 255 / 0.72)',
        '--ex-border': 'rgb(0 0 0 / 0.12)',
        '--ex-accent': '#1b6e2b',
        '--ex-track': 'rgb(0 0 0 / 0.2)',
        '--ex-shadow': 'rgb(255 255 255 / 0.7)',
      } as CSSProperties,
      scrim: 'bg-[radial-gradient(ellipse_at_bottom_left,rgba(255,255,255,0.85),transparent_60%)]',
      scrimTop: 'from-white/70',
      logo: '/brand/ifsp-logo-texto-escuro.svg',
    };
  return {
    dark: true,
    bg: '#05080a',
    floor: '#0b1110',
    vars: {
      '--ex-text': '#ffffff',
      '--ex-muted': 'rgb(255 255 255 / 0.8)',
      '--ex-panel': 'rgb(0 0 0 / 0.45)',
      '--ex-border': 'rgb(255 255 255 / 0.12)',
      '--ex-accent': '#62d275',
      '--ex-track': 'rgb(255 255 255 / 0.25)',
      '--ex-shadow': 'rgb(0 0 0 / 0.8)',
    } as CSSProperties,
    scrim: 'bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.75),transparent_60%)]',
    scrimTop: 'from-black/60',
    logo: '/brand/ifsp-logo-texto-claro.svg',
  };
}
