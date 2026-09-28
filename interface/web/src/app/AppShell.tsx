import { Menu, Pin, PinOff, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ModeBadge } from '@/components/ModeBadge';
import { LanChip } from '@/components/LanChip';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Alert } from '@/components/ui/status';
import { Button } from '@/components/ui/button';
import { CalibrationIndicator } from '@/features/calibration/CalibrationIndicator';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import { SerialConnect } from '@/features/serial/SerialConnect';
import { cn } from '@/lib/cn';
import { useConnection } from '@/stores/connection';
import { NAV, NAV_GROUPS } from './nav';

function Logo() {
  return (
    <span className="flex items-center gap-3">
      <img src="/brand/ifsp-logo-texto-escuro.svg" alt="" className="logo-for-light h-9 w-auto" />
      <img src="/brand/ifsp-logo-texto-claro.svg" alt="" className="logo-for-dark h-9 w-auto" />
      <span className="sr-only">Instituto Federal de São Paulo</span>
    </span>
  );
}

function NavLinks({ items, onNavigate }: { items: typeof NAV; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map(({ path, label, Icon }) => (
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

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-4">
      {NAV_GROUPS.map(({ id, label }) => {
        const items = NAV.filter((n) => n.group === id);
        if (!items.length) return null;
        if (!label) return <NavLinks key={id} items={items} onNavigate={onNavigate} />;
        return (
          <section key={id} aria-labelledby={`nav-${id}`}>
            <h2 id={`nav-${id}`} className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
              {label}
            </h2>
            <NavLinks items={items} onNavigate={onNavigate} />
          </section>
        );
      })}
    </div>
  );
}

const PIN_KEY = 'stewart-nav-pinned';
function readPinned() {
  try {
    return localStorage.getItem(PIN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Menu lateral: fica escondido e abre por cima da página ao passar o mouse na borda
 * esquerda ou pelo botão de menu. "Fixar" deixa aberto ao lado do conteúdo (lembrado).
 */
function useSideMenu() {
  const [pinned, setPinnedState] = useState(readPinned);
  const [open, setOpen] = useState(false);
  // aberto pelo hover fecha quando o mouse sai; pelo botão, só com clique fora ou navegando
  const byHover = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const setPinned = (v: boolean) => {
    setPinnedState(v);
    setOpen(false);
    try {
      localStorage.setItem(PIN_KEY, v ? '1' : '0');
    } catch {
      /* sem storage: vale só nesta sessão */
    }
  };
  const toggle = () => {
    clear();
    byHover.current = false;
    setOpen((v) => !v);
  };
  const close = useCallback(() => {
    clear();
    byHover.current = false;
    setOpen(false);
  }, []);
  const hoverEnter = () => {
    clear();
    if (open) return;
    // pequena espera: passar o mouse de relance pela borda não abre
    timer.current = setTimeout(() => {
      byHover.current = true;
      setOpen(true);
    }, 140);
  };
  const hoverLeave = () => {
    clear();
    if (!byHover.current) return;
    timer.current = setTimeout(() => {
      byHover.current = false;
      setOpen(false);
    }, 280);
  };
  useEffect(() => clear, []);
  return { pinned, setPinned, open, toggle, close, hoverEnter, hoverLeave };
}

export function AppShell() {
  const menu = useSideMenu();
  const menuOpen = menu.open;
  const backendOnline = useConnection((s) => s.backendOnline);
  const location = useLocation();
  const main = useRef<HTMLElement>(null);

  // Ao trocar de página, leva o foco para o conteúdo (leitores de tela anunciam o novo título)
  const first = useRef(true);
  const closeMenu = menu.close;
  useEffect(() => {
    closeMenu();
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [location.pathname, closeMenu]);

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
          {!menu.pinned && (
            <Button size="icon" variant="ghost" aria-expanded={menuOpen} aria-controls="menu-principal" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} onClick={menu.toggle}>
              {menuOpen ? <X aria-hidden /> : <Menu aria-hidden />}
            </Button>
          )}
          <NavLink to="/" className="flex items-center gap-3 rounded-lg">
            <Logo />
            <span className="hidden border-l border-border pl-3 text-sm font-semibold leading-tight sm:block">
              Plataforma
              <br />
              de Stewart
            </span>
          </NavLink>
          <ModeBadge />
          <CalibrationIndicator />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="hidden md:block">
              <SerialConnect compact />
            </div>
            <LanChip />
            <ThemeToggle />
            <EmergencyStopButton />
          </div>
        </div>
        <div className="border-t border-border px-4 py-2 md:hidden">
          <SerialConnect compact />
        </div>
      </header>

      {/* borda esquerda: passar o mouse abre o menu (só com mouse; no toque, o botão) */}
      {!menu.pinned && !menuOpen && (
        <div aria-hidden className="fixed inset-y-0 left-0 z-40 hidden w-2 [@media(hover:hover)]:block" onMouseEnter={menu.hoverEnter} onMouseLeave={menu.hoverLeave} />
      )}
      {!menu.pinned && menuOpen && <div aria-hidden className="fixed inset-0 z-40 bg-black/25" onClick={menu.close} />}

      <div className="flex">
        <nav
          id="menu-principal"
          aria-label="Principal"
          inert={!menu.pinned && !menuOpen}
          onMouseEnter={menu.pinned ? undefined : menu.hoverEnter}
          onMouseLeave={menu.pinned ? undefined : menu.hoverLeave}
          className={cn(
            'w-64 shrink-0 overflow-y-auto border-r border-border bg-surface p-3',
            menu.pinned
              ? 'sticky top-[57px] z-30 hidden h-[calc(100dvh-57px)] md:block'
              : cn('fixed inset-y-0 left-0 z-50 shadow-2xl transition-transform duration-200 motion-reduce:transition-none', menuOpen ? 'translate-x-0' : '-translate-x-full'),
          )}
        >
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Menu</span>
            <Button
              size="sm"
              variant="ghost"
              className="hidden md:inline-flex"
              aria-pressed={menu.pinned}
              onClick={() => menu.setPinned(!menu.pinned)}
              title={menu.pinned ? 'Soltar: o menu volta a abrir só pela borda ou pelo botão' : 'Fixar o menu aberto ao lado do conteúdo'}
            >
              {menu.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
              {menu.pinned ? 'Soltar' : 'Fixar'}
            </Button>
          </div>
          <Nav onNavigate={menu.close} />
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
