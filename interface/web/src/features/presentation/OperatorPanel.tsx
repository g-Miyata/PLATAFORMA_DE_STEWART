import { LogOut, Maximize, Minimize, Smartphone, Wifi, X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { SelectField, SwitchField } from '@/components/ui/field';
import { mmss } from '@/features/routines/MotionStatusCard';
import { deviceName } from '@/features/mobile/lan';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import type { LanDevice } from '@/lib/api';
import type { ExhibitMode } from './theme';
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
  mode: ExhibitMode;
  onMode: (m: ExhibitMode) => void;
  flightName: string | null;
  fgReady: boolean;
  /** modo rede ligado (celular do público) */
  lan: boolean;
  onLanStart: () => void;
  /** a apresentação liga o modo rede sozinha ao abrir */
  autoLan: boolean;
  onAutoLan: (on: boolean) => void;
  lanStarting: boolean;
  showQr: boolean;
  onShowQr: (on: boolean) => void;
  /** celular conectado agora */
  phone: LanDevice | null;
  onKick: (id: string) => void;
}

const MODES: { id: ExhibitMode; label: string; description: string }[] = [
  { id: 'show', label: 'Show automático', description: 'as cenas em laço; o público pode tocar para controlar' },
  { id: 'voo', label: 'Simulador de voo (motion cueing)', description: 'um voo gravado do ERJ145 em laço, com washout' },
  { id: 'orientacao', label: 'Orientação do avião', description: 'o mesmo voo, com o tampo copiando roll e pitch do avião' },
];

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

  const modeName = useId();
  const voo = p.mode !== 'show';
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-labelledby="operador-titulo"
      className="glass absolute right-4 top-4 z-30 max-h-[calc(100%-2rem)] w-[min(24rem,calc(100%-2rem))] space-y-4 overflow-y-auto rounded-xl border border-border p-4 shadow-2xl outline-none"
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
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-sm font-semibold">O que a tela mostra</legend>
        {MODES.map((m) => (
          <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name={modeName} checked={p.mode === m.id} onChange={() => p.onMode(m.id)} className="mt-0.5 size-4 accent-[var(--c-brand)]" />
            <span>
              <span className="font-medium">{m.label}</span> <span className="text-muted">— {m.description}</span>
            </span>
          </label>
        ))}
        {voo && (
          <p className="text-xs text-muted">
            {p.flightName ? `Tocando: ${p.flightName}. ` : 'Carregando o voo… '}
            {p.fgReady ? 'O FlightGear aparece no canto da tela.' : 'Abra o FlightGear na página Simulador de voo para mostrar o avião também.'}
          </p>
        )}
      </fieldset>
      <div role="status" aria-live="polite" className="text-sm">
        {voo && p.real ? (
          <>
            <span className="font-semibold">{p.simulated ? 'Simulador' : 'Bancada'}:</span> {p.mode === 'orientacao' ? 'copiando a orientação do avião' : 'engatada no motion cueing'}
            {p.remaining !== null && <span className="block text-muted tabular-nums">Sessão termina em {mmss(p.remaining)}</span>}
          </>
        ) : p.real ? (
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
        description={
          p.mode === 'orientacao'
            ? 'Engata a plataforma na orientação do avião: o tampo copia roll e pitch (dentro do limite de inclinação) e volta ao neutro ao desligar.'
            : voo
            ? 'Engata a plataforma no motion cueing: ela sente o voo (dentro do curso e da velocidade dos pistões) e volta ao neutro ao desligar.'
            : `Toca ${p.playlistLength} movimentos com amplitude reduzida (até ~10 mm/s), com pausa no home entre eles.`
        }
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
        disabled={!p.real || voo}
      />
      <SelectField label="Duração da sessão" value={String(p.sessionMin)} onChange={(e) => p.onSessionMin(Number(e.target.value))} disabled={p.real}>
        {[5, 10, 15, 20, 30, 60].map((m) => (
          <option key={m} value={m}>
            {m} minutos
          </option>
        ))}
      </SelectField>
      {!p.canCommand && <p className="text-xs text-muted">Conecte o simulador ou a bancada (na interface normal) para mover de verdade.</p>}
      <div className="space-y-2 border-t border-border pt-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Smartphone aria-hidden className="size-4" />
          Celular do público
        </p>
        {!p.lan ? (
          <>
            <p className="text-xs text-muted">Liga o modo rede: aparece um QR code na tela, e quem estiver no mesmo Wi-Fi controla pelo celular (um por vez).</p>
            <Button size="sm" variant="secondary" onClick={p.onLanStart} disabled={p.lanStarting}>
              <Wifi aria-hidden />
              {p.lanStarting ? 'Ligando…' : 'Ligar o modo rede'}
            </Button>
          </>
        ) : (
          <>
            <SwitchField label="Mostrar o QR code na tela" description="O QR já leva o PIN: quem escanear entra direto." checked={p.showQr} onCheckedChange={p.onShowQr} disabled={p.mode !== 'show'} />
            <SwitchField
              label="Ligar o modo rede ao abrir a apresentação"
              description="Neste PC, a apresentação religa o modo rede sozinha (também se o backend reiniciar)."
              checked={p.autoLan}
              onCheckedChange={p.onAutoLan}
            />
            {p.phone ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  <span className="font-medium">{deviceName(p.phone.agent)}</span> no comando <span className="font-mono text-xs text-muted">{p.phone.ip}</span>
                </span>
                <Button size="sm" variant="secondary" onClick={() => p.onKick(p.phone!.id)}>
                  Desconectar
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted">Nenhum celular conectado.</p>
            )}
          </>
        )}
      </div>
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
