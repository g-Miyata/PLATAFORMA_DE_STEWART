import { Canvas } from '@react-three/fiber';
import { Camera, Maximize2, RotateCcw } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { solvePose, zeroPose, type LegStatus } from '@/lib/kinematics';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';
import { useUi } from '@/stores/ui';
import { ExpandedViewer } from './ExpandedViewer';
import { useGeometry } from './geometry';
import { CAMERA_VIEWS, Scene, type CameraView } from './Scene';
import { SceneStore, type ViewerSource } from './sceneState';

const STATUS_TEXT: Record<LegStatus, string> = { ok: 'no curso', near: 'perto do limite', invalid: 'fora do curso' };
const STATUS_CLASS: Record<LegStatus, string> = { ok: 'text-brand-text', near: 'text-warning', invalid: 'text-danger' };

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#101010';
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface PlatformViewerProps {
  /** Pose comandada/prevista pela página. Com telemetria ao vivo, aparece como fantasma. */
  target?: Pose | null;
  targetLabel?: string;
  title?: string;
  className?: string;
  /** altura do canvas (classe tailwind) */
  canvasClassName?: string;
  showTable?: boolean;
  /** usa a pose comandada pelas rotinas (motion_tick) como alvo, em vez de `target` */
  followMotion?: boolean;
  /** 'target' = só a pose calculada; 'live' = só a medida; 'auto' = medida + fantasma */
  source?: ViewerSource;
  /** mostra o botão "Expandir" (tela cheia com dados) */
  expandable?: boolean;
  /** pose calculada usada só para comparar na tela cheia (erro real − calculada) */
  reference?: Pose | null;
  /** esconde o título (quando o contêiner já tem um) */
  hideTitle?: boolean;
  /** cabeçalho compacto (janela flutuante): "Expandir" só com ícone */
  compactHeader?: boolean;
}

export function PlatformViewer({
  target = null,
  targetLabel = 'Comandada',
  title = 'Modelo 3D da plataforma',
  className,
  canvasClassName = 'h-80 sm:h-[26rem]',
  showTable = true,
  followMotion = false,
  source = 'auto',
  expandable = false,
  reference = null,
  hideTitle = false,
  compactHeader = false,
}: PlatformViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const simulated = useConnection((s) => s.serial.simulated && s.serial.connected);
  const headingId = useId();

  const [store] = useState(() => new SceneStore(geometry, prefersReducedMotion(), source));

  // pose alvo vinda da página e geometria do backend
  useEffect(() => {
    if (!followMotion) store.setTarget(target);
  }, [store, target, followMotion]);
  useEffect(() => store.setGeometry(geometry), [store, geometry]);

  // telemetria ao vivo sem re-render: vai direto para o estado da cena
  useEffect(
    () =>
      useTelemetry.subscribe((s) => {
        if (s.telemetry?.pose_live) store.setLive(s.telemetry.pose_live);
        if (followMotion && s.motionTick) store.setTarget(s.motionTick.pose_cmd);
      }),
    [store, followMotion],
  );

  // tabela textual (equivalente acessível do 3D), atualizada a 4 Hz
  const [snapshot, setSnapshot] = useState(() => ({ live: null as Pose | null, target }));
  useEffect(() => {
    const id = setInterval(
      () =>
        setSnapshot({
          live: source === 'target' ? null : store.freshLive(),
          target: source === 'live' ? null : store.currentTarget(),
        }),
      250,
    );
    return () => clearInterval(id);
  }, [store, source]);

  // cores da cena seguem o tema (o atributo data-theme muda antes do estado)
  const colors = useMemo(() => {
    void theme;
    return { bg: cssVar('--c-scene-bg'), grid: cssVar('--c-scene-grid') };
  }, [theme]);

  // não renderiza enquanto estiver fora da tela
  const wrapper = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = wrapper.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const [view, setView] = useState<CameraView>('iso');
  const [viewNonce, setViewNonce] = useState(0);
  const [hasWebgl] = useState(webglAvailable);

  const shown = snapshot.live ?? snapshot.target ?? zeroPose(geometry.home_z);
  const waitingLive = source === 'live' && !snapshot.live;
  const solidLabel =
    source === 'target' ? targetLabel : snapshot.live ? (simulated ? 'Modelo virtual' : 'Real (telemetria)') : waitingLive ? 'Sem telemetria' : 'Prevista';
  const shownState = solvePose(shown, geometry);
  const targetState = snapshot.live && snapshot.target ? solvePose(snapshot.target, geometry) : null;
  const summary =
    `${title}. ${snapshot.live ? (simulated ? 'Pose do modelo virtual' : 'Pose medida') : 'Pose prevista'}: ` +
    `X ${fmt(shown.x)} mm, Y ${fmt(shown.y)} mm, Z ${fmt(shown.z)} mm, ` +
    `roll ${fmt(shown.roll)} graus, pitch ${fmt(shown.pitch)} graus, yaw ${fmt(shown.yaw)} graus. ` +
    (shownState.valid ? 'Todos os atuadores no curso.' : 'Há atuadores fora do curso.');

  return (
    <section aria-labelledby={headingId} className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className={cn('text-base font-semibold', hideTitle && 'sr-only')}>
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Vista da câmera">
          <Camera aria-hidden className="size-4 text-muted" />
          {(Object.keys(CAMERA_VIEWS) as CameraView[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'primary' : 'ghost'}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setViewNonce((n) => n + 1);
              }}
            >
              {CAMERA_VIEWS[v].label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" aria-label="Recentralizar câmera" onClick={() => setViewNonce((n) => n + 1)}>
            <RotateCcw aria-hidden />
          </Button>
          {expandable && (
            <Button size="sm" variant="outline" onClick={() => setExpanded(true)} aria-label={`Expandir ${title} em tela cheia`} title="Expandir em tela cheia">
              <Maximize2 aria-hidden />
              {!compactHeader && 'Expandir'}
            </Button>
          )}
        </div>
      </div>

      <div
        ref={wrapper}
        role="img"
        aria-label={summary}
        className={cn('relative overflow-hidden rounded-xl border border-border bg-surface-2', canvasClassName)}
      >
        {hasWebgl ? (
          <Canvas
            shadows
            dpr={[1, 2]}
            frameloop={visible ? 'always' : 'never'}
            camera={{ position: CAMERA_VIEWS.iso.position, up: [0, 0, 1], fov: 35, near: 5, far: 20000 }}
            gl={{ antialias: true }}
          >
            <Scene
              geometry={geometry}
              store={store}
              background={colors.bg}
              gridColor={colors.grid}
              view={view}
              viewNonce={viewNonce}
            />
          </Canvas>
        ) : (
          <p className="p-6 text-sm text-muted">
            Este navegador não oferece WebGL, então o modelo 3D não pode ser exibido. A tabela abaixo mostra os mesmos valores.
          </p>
        )}
        {waitingLive && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-surface/90 px-3 py-2 text-center text-sm text-muted">
            Aguardando telemetria: conecte o simulador ou a porta serial no topo.
          </p>
        )}
        <div aria-hidden className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1 rounded-lg bg-surface/85 px-2.5 py-1.5 text-xs backdrop-blur">
          <span className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-4 rounded-sm bg-[#17191b] ring-1 ring-border-strong" />
            {solidLabel}
          </span>
          {targetState && (
            <span className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-brand/40 ring-1 ring-brand" />
              {targetLabel}
            </span>
          )}
        </div>
      </div>

      {showTable && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm tabular-nums">
            <caption className="sr-only">Comprimento de cada atuador</caption>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-1 pr-2 font-medium">Pistão</th>
                <th scope="col" className="py-1 pr-2 font-medium">{snapshot.live || waitingLive ? 'Atual' : 'Previsto'}</th>
                {targetState && <th scope="col" className="py-1 pr-2 font-medium">{targetLabel}</th>}
                <th scope="col" className="py-1 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {shownState.lengths.map((l, i) => {
                const st = targetState ? targetState.status[i] : shownState.status[i];
                return (
                  <tr key={i} className="border-t border-border">
                    <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span aria-hidden className="size-2.5 rounded-full" style={{ background: PISTON_COLORS[i] }} />
                        P{i + 1}
                      </span>
                    </th>
                    <td className="py-1.5 pr-2">{waitingLive ? '—' : fmt(l, 1, 'mm')}</td>
                    {targetState && <td className="py-1.5 pr-2">{fmt(targetState.lengths[i], 1, 'mm')}</td>}
                    <td className={cn('py-1.5 font-medium', waitingLive ? 'text-muted' : STATUS_CLASS[st])}>{waitingLive ? 'sem dados' : STATUS_TEXT[st]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {expandable && expanded && (
        <ExpandedViewer
          open={expanded}
          onOpenChange={setExpanded}
          geometry={geometry}
          viewer={{ target, targetLabel, title, followMotion, source, reference }}
        />
      )}
    </section>
  );
}
