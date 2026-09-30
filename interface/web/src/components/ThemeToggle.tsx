import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUi } from '@/stores/ui';

export function ThemeToggle() {
  const theme = useUi((s) => s.theme);
  const toggle = useUi((s) => s.toggleTheme);
  const next = theme === 'dark' ? 'claro' : 'escuro';
  return (
    <Button size="icon" variant="ghost" onClick={toggle} aria-label={`Usar tema ${next}`} title={`Usar tema ${next}`}>
      {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
