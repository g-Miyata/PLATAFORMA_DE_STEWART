import { create } from 'zustand';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'stewart-theme';

function readTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  return attr === 'dark' ? 'dark' : 'light';
}

function persistTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* modo privado / storage bloqueado: segue só na sessão */
  }
}

interface UiState {
  theme: Theme;
  toggleTheme: () => void;
  /** Incrementa a cada parada de emergência; páginas desligam o controle ao vivo. */
  estopCount: number;
  notifyEmergencyStop: () => void;
}

export const useUi = create<UiState>((set, get) => ({
  theme: readTheme(),
  toggleTheme: () => {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark';
    persistTheme(theme);
    set({ theme });
  },
  estopCount: 0,
  notifyEmergencyStop: () => set((s) => ({ estopCount: s.estopCount + 1 })),
}));
