import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ModeBadge } from '@/components/ModeBadge';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import { SerialConnect } from '@/features/serial/SerialConnect';
import { cn } from '@/lib/cn';
import { useConnection } from '@/stores/connection';
import { NAV } from './nav';

function Logo() {
  return (
    <span className="flex items-center gap-3">
      <img src="/brand/ifsp-logo-texto-escuro.svg" alt="" className="logo-for-light h-9 w-auto" />
      <img src="/brand/ifsp-logo-texto-claro.svg" alt="" className="logo-for-dark h-9 w-auto" />
      <span className="sr-only">Instituto Federal de São Paulo</span>
    </span>
  );
}

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {NAV.map(({ path, label, Icon }) => (
        <li key={path}>
          <NavLink
            to={path}
            end={path === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-5',
                isActive ? 'bg-primary text-on-primary' : 'text-fg hover:bg-surface-2',
              )
            }
          >
            <Icon aria-hidden />
            {label}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const backendOnline = useConnection((s) => s.backendOnline);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);

  // Ao trocar de página, leva o foco para o conteúdo (leitores de tela anunciam o novo título)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <Button
            size="icon"
            variant="ghost"
            className="lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="menu-principal"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
          <NavLink to="/" className="flex items-center gap-3 rounded-lg">
            <Logo />
            <span className="hidden border-l border-border pl-3 text-sm font-semibold leading-tight sm:block">
              Plataforma
              <br />
              de Stewart
            </span>
          </NavLink>
          <ModeBadge />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="hidden md:block">
              <SerialConnect compact />
            </div>
            <ThemeToggle />
            <EmergencyStopButton />
          </div>
        </div>
        <div className="border-t border-border px-4 py-2 md:hidden">
          <SerialConnect compact />
        </div>
      </header>

      <div className="flex">
        <nav
          id="menu-principal"
          aria-label="Principal"
          className={cn(
            'z-30 w-64 shrink-0 border-r border-border bg-surface p-3',
            'lg:sticky lg:top-[57px] lg:block lg:h-[calc(100dvh-57px)] lg:overflow-y-auto',
            menuOpen ? 'fixed inset-y-0 left-0 top-[57px] block overflow-y-auto shadow-xl' : 'hidden',
          )}
        >
          <Nav onNavigate={() => setMenuOpen(false)} />
          <p className="mt-6 px-3 text-xs text-muted">
            <a className="underline hover:text-fg" href="/antigo/">
              Interface antiga
            </a>
            {' · '}
            <a className="underline hover:text-fg" href="/docs" target="_blank" rel="noreferrer">
              API
            </a>
          </p>
        </nav>

        <main id="conteudo" ref={main} tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 outline-none sm:px-6 lg:px-8">
          {backendOnline === false && (
            <Alert tone="danger" title="Backend offline" className="mb-4">
              O servidor FastAPI não está respondendo em {window.location.host}. Execute o <code>start.bat</code> na raiz do
              projeto. A interface volta sozinha quando ele subir.
            </Alert>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
