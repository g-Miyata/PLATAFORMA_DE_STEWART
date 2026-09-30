import { Box, GripHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { PlatformViewer, type PlatformViewerProps } from '@/features/platform3d/PlatformViewer';

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Plataforma de Stewart · IFSP`;
  }, [title]);
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------------- janela flutuante do modelo 3D ----------------
const PANEL_KEY = 'stewart-viewer-panel';
const SIZE_KEY = 'stewart-viewer-size';
const MIN = { w: 320, h: 300 };
const DEFAULT_SIZE = { w: 512, h: 420 };
const KEY_STEP = 32;

function readPanel() {
  try {
    return localStorage.getItem(PANEL_KEY) === 'open';
  } catch {
    return false;
  }
}

function clampSize(size: { w: number; h: number }) {
  // deixa espaço para o botão flutuante e o cabeçalho
  const maxW = Math.max(MIN.w, window.innerWidth - 32);
  const maxH = Math.max(MIN.h, window.innerHeight - 160);
  return { w: Math.round(Math.min(maxW, Math.max(MIN.w, size.w))), h: Math.round(Math.min(maxH, Math.max(MIN.h, size.h))) };
}

function readSize() {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { w: number; h: number };
      if (Number.isFinite(v.w) && Number.isFinite(v.h)) return clampSize(v);
    }
  } catch {
    /* sem storage ou valor inválido */
  }
  return clampSize(DEFAULT_SIZE);
}

function saveSize(size: { w: number; h: number }) {
  try {
    localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  } catch {
    /* vale só nesta sessão */
  }
}

/** Janela ancorada no canto inferior direito; a alça no canto superior esquerdo redimensiona. */
function FloatingViewer({ viewer }: { viewer?: PlatformViewerProps }) {
  const [size, setSize] = useState(readSize);
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const onResize = () => setSize((s) => clampSize(s));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function onPointerDown(e: PointerEvent<HTMLButtonElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
  }
  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    // puxar para a esquerda/para cima aumenta (a janela é ancorada embaixo à direita)
    setSize(clampSize({ w: d.w + (d.x - e.clientX), h: d.h + (d.y - e.clientY) }));
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    setSize((s) => {
      saveSize(s);
      return s;
    });
  }
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [KEY_STEP, 0],
      ArrowRight: [-KEY_STEP, 0],
      ArrowUp: [0, KEY_STEP],
      ArrowDown: [0, -KEY_STEP],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    setSize((s) => {
      const next = clampSize({ w: s.w + d[0], h: s.h + d[1] });
      saveSize(next);
      return next;
    });
  }

  return (
    <aside
      id="painel-3d"
      aria-label="Modelo 3D"
      style={{ width: size.w, height: size.h }}
      className="pointer-events-auto relative flex min-w-0 rounded-xl border border-border bg-surface p-3 pt-4 shadow-2xl"
    >
      <button
        type="button"
        aria-label={`Redimensionar janela do modelo 3D (${size.w} por ${size.h} pixels). Setas para esquerda e para cima aumentam.`}
        title="Arraste para redimensionar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="absolute -left-2 -top-2 z-10 flex size-7 cursor-nwse-resize touch-none items-center justify-center rounded-full border border-border-strong bg-surface text-muted shadow hover:text-fg"
      >
        <GripHorizontal aria-hidden className="size-4 -rotate-45" />
      </button>
      <PlatformViewer className="min-h-0 min-w-0 flex-1" canvasClassName="min-h-0 min-w-0 flex-1" showTable={false} expandable compactHeader {...viewer} />
    </aside>
  );
}

/**
 * Página sem 3D próprio: o conteúdo usa a largura toda e o modelo 3D abre numa
 * janela flutuante (redimensionável) pelo botão fixo no canto inferior direito.
 */
export function WithViewer({ children, viewer }: { children: ReactNode; viewer?: PlatformViewerProps }) {
  const [open, setOpen] = useState(readPanel);
  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem(PANEL_KEY, v ? 'closed' : 'open');
      } catch {
        /* sem storage: vale só nesta sessão */
      }
      return !v;
    });

  return (
    <>
      {/* espaço no fim para o botão flutuante não cobrir o último conteúdo */}
      <div className="space-y-5 pb-20">{children}</div>
      <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3">
        {open && <FloatingViewer viewer={viewer} />}
        <Button
          variant="primary"
          size="lg"
          className="pointer-events-auto rounded-full shadow-lg"
          aria-expanded={open}
          aria-controls="painel-3d"
          onClick={toggle}
        >
          {open ? <X aria-hidden /> : <Box aria-hidden />}
          {open ? 'Ocultar modelo 3D' : 'Mostrar modelo 3D'}
        </Button>
      </div>
    </>
  );
}
