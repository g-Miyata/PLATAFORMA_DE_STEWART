import { LogOut, Maximize, Minimize, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { SelectField, SwitchField } from '@/components/ui/field';
import { mmss } from '@/features/routines/MotionStatusCard';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import type { KioskState } from './useKiosk';

interface OperatorPanelProps {
  onClose: () => void;
  canCommand: boolean;
  simulated: boolean;
  real: boolean;
  onReal: (on: boolean) => void;
  publicReal: boolean;
  onPublicReal: (on: boolean) => void;
  sessionMin: number;
  onSessionMin: (m: number) => void;
  remaining: number | null;
  kiosk: KioskState;
  playlistLength: number;
  fullscreen: boolean;
  onFullscreen: () => void;
}

const AUTO_CLOSE_MS = 20_000;

/**
 * Controles do operador (escondidos do público): abre com a tecla O ou segurando
 * o logo. Não é um diálogo modal: o Esc continua sendo a parada de emergência.
 */
export function OperatorPanel(p: OperatorPanelProps) {
  const ref = useRef<HTMLElement>(null);
  const onClose = useRef(p.onClose);
  useEffect(() => {
    onClose.current = p.onClose;
  });

  // fecha sozinho quando ninguém mexe nele
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let t = setTimeout(() => onClose.current(), AUTO_CLOSE_MS);
    const reset = () => {
      clearTimeout(t);
      t = setTimeout(() => onClose.current(), AUTO_CLOSE_MS);
    };
    el.addEventListener('pointermove', reset);
    el.addEventListener('keydown', reset);
    el.focus();
    return () => {
      clearTimeout(t);
      el.removeEventListener('pointermove', reset);
      el.removeEventListener('keydown', reset);
    };
  }, []);

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-labelledby="operador-titulo"
      className="glass absolute right-4 top-4 z-30 w-[min(24rem,calc(100%-2rem))] space-y-4 rounded-xl border border-border p-4 shadow-2xl outline-none"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="operador-titulo" className="text-lg font-semibold">
          Painel do operador
        </h2>
        <Button size="icon" variant="ghost" onClick={p.onClose} aria-label="Fechar painel do operador">
          <X aria-hidden />
        </Button>
      </div>
      <div role="status" aria-live="polite" className="text-sm">
        {p.real ? (
          <>
            <span className="font-semibold">{p.simulated ? 'Simulador' : 'Bancada'}:</span>{' '}
            {p.kiosk.phase === 'resting' ? 'pausa no home' : (p.kiosk.current ?? 'controle do público')}
            {p.remaining !== null && <span className="block text-muted tabular-nums">Sessão termina em {mmss(p.remaining)}</span>}
          </>
        ) : (
          <span className="text-muted">Só o modelo 3D se move.</span>
        )}
      </div>
      <SwitchField
        label="Mover a plataforma de verdade"
        description={`Toca ${p.playlistLength} movimentos com amplitude reduzida (até ~10 mm/s), com pausa no home entre eles.`}
        checked={p.real}
        onCheckedChange={p.onReal}
        disabled={!p.canCommand}
        tone="danger"
      />
      <SwitchField
        label="Controle do público move a bancada"
        description="Quem tocar na tela inclina a bancada de verdade (até 5°, devagar). Desligado: o público só mexe no modelo."
        checked={p.publicReal}
        onCheckedChange={p.onPublicReal}
        disabled={!p.real}
      />
      <SelectField label="Duração da sessão" value={String(p.sessionMin)} onChange={(e) => p.onSessionMin(Number(e.target.value))} disabled={p.real}>
        {[5, 10, 15, 20, 30, 60].map((m) => (
          <option key={m} value={m}>
            {m} minutos
          </option>
        ))}
      </SelectField>
      {!p.canCommand && <p className="text-xs text-muted">Conecte o simulador ou a bancada (na interface normal) para mover de verdade.</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button size="sm" variant="secondary" onClick={p.onFullscreen} aria-pressed={p.fullscreen}>
          {p.fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
          {p.fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </Button>
        <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium hover:bg-surface-2">
          <LogOut aria-hidden className="size-4" />
          Sair da apresentação
        </Link>
        <EmergencyStopButton />
      </div>
      <p className="text-xs text-muted">
        <kbd className="rounded border border-border-strong bg-surface-2 px-1">Esc</kbd> para tudo · <kbd className="rounded border border-border-strong bg-surface-2 px-1">O</kbd> abre e fecha este painel
      </p>
    </aside>
  );
}
