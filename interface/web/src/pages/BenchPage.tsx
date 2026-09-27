import { Canvas } from '@react-three/fiber';
import { Box, Eye, EyeOff, Gauge, Home, Maximize, Minimize, MousePointerClick, Send, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import * as THREE from 'three';
import { toast } from 'sonner';
import { ModeBadge } from '@/components/ModeBadge';
import { glass, stageClass, useFullscreen } from '@/components/Stage';
import { Button } from '@/components/ui/button';
import { SliderField, SwitchField } from '@/components/ui/field';
import { StatusPill } from '@/components/ui/status';
import { AXIS_LABEL, PLATFORM_AXES, useBench, type PlatformAxis } from '@/features/bench3d/benchStore';
import { BenchScene, type Quality } from '@/features/bench3d/BenchScene';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { useThrottledTelemetry } from '@/features/control/useThrottled';
import { PoseEditor } from '@/features/control/PoseEditor';
import { useGeometry } from '@/features/platform3d/geometry';
import { AddKeyButton } from '@/features/recorder/AddKeyButton';
import { CAMERA_VIEWS, type CameraView } from '@/features/platform3d/Scene';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { poseStatus } from '@/lib/kinematics';
import { uiLimits } from '@/lib/limits';
import { fmt, PISTON_COLORS, PISTONS } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';
import { useUi } from '@/stores/ui';

const LIVE_MS = 100;

// ---------------- painéis ----------------
function PoseReadout() {
  const pose = useBench((s) => s.pose);
  return (
    <dl className="grid grid-cols-3 gap-1.5 text-xs tabular-nums">
      {(['x', 'y', 'z', 'roll', 'pitch', 'yaw'] as const).map((k) => (
        <div key={k} className="rounded-md bg-surface-2/80 px-2 py-1">
          <dt className="uppercase text-muted">{k}</dt>
          <dd className="text-sm font-semibold">{fmt(pose[k], k.length === 1 ? 1 : 2, k.length === 1 ? 'mm' : '°')}</dd>
        </div>
      ))}
    </dl>
  );
}

function PistonPanel({ index }: { index: number }) {
  const geometry = useBench((s) => s.geometry);
  const length = useBench((s) => s.lengths[index]);
  const pose = useBench((s) => s.pose);
  const real = useThrottledTelemetry((s) => s.telemetry?.actuator_lengths_abs?.[index] ?? null, 200);
  // curso de OPERAÇÃO (com a margem); o curso mostrado continua contado do recolhido
  const [min, max] = uiLimits(geometry).stroke;
  const stroke = length - geometry.stroke_min;
  const pct = (stroke / (geometry.stroke_max - geometry.stroke_min)) * 100;
  const status = poseStatus(pose, geometry)[index];
  const set = (v: number) => {
    const s = useBench.getState();
    s.checkpoint();
    s.setPistonLength(index, v);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span aria-hidden className="size-3 rounded-full" style={{ background: PISTON_COLORS[index] }} />
          Pistão {index + 1}
        </h2>
        {status === 'ok' ? <StatusPill tone="success">no curso</StatusPill> : <StatusPill tone={status === 'near' ? 'warning' : 'danger'}>{status === 'near' ? 'perto do limite' : 'fora do curso'}</StatusPill>}
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums">{fmt(length, 1, 'mm')}</p>
        <p className="text-sm text-muted">
          curso {fmt(stroke, 1, 'mm')} de {geometry.stroke_max - geometry.stroke_min} mm · folga até o limite de operação {fmt(Math.min(length - min, max - length), 1, 'mm')}
        </p>
        <div aria-hidden className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: PISTON_COLORS[index] }} />
        </div>
        {real !== null && (
          <p className="mt-2 text-xs text-muted">
            Real (telemetria): <span className="font-semibold text-fg tabular-nums">{fmt(real, 1, 'mm')}</span> · Δ {fmt(real - length, 1, 'mm')}
          </p>
        )}
      </div>
      <SliderField label="Comprimento" value={length} onValueChange={set} min={min} max={max} step={0.5} unit="mm" unitSpoken="milímetros" />
      <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Ajuste fino">
        {[-10, -1, 1, 10].map((d) => (
          <Button key={d} size="sm" variant="secondary" onClick={() => set(length + d)} aria-label={`${d > 0 ? 'Aumentar' : 'Diminuir'} ${Math.abs(d)} milímetro${Math.abs(d) > 1 ? 's' : ''}`}>
            {d > 0 ? `+${d}` : d}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted">Os outros cinco pistões ficam fixos; o tampo se acomoda pela cinemática direta. Arraste a seta no modelo ou use ↑/↓ (Shift = 10 mm).</p>
    </div>
  );
}

function PlatformPanel({ axis }: { axis: PlatformAxis }) {
  const pose = useBench((s) => s.pose);
  const lengths = useBench((s) => s.lengths);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Plataforma inteira</h2>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Eixo do ponto central</legend>
        <div className="grid grid-cols-4 gap-1.5">
          {PLATFORM_AXES.map((a) => (
            <label key={a} className="relative">
              <input
                type="radio"
                name="eixo-plataforma"
                className="peer sr-only"
                checked={axis === a}
                onChange={() => useBench.getState().select({ kind: 'platform', axis: a })}
              />
              <span
                className={cn(
                  'flex h-9 cursor-pointer items-center justify-center rounded-lg border text-xs font-semibold',
                  'peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                  axis === a ? 'border-transparent bg-primary text-on-primary' : 'border-border bg-surface-2 hover:bg-surface-3',
                )}
              >
                {AXIS_LABEL[a]}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <PoseEditor
        pose={pose}
        onChange={(p) => {
          const s = useBench.getState();
          s.checkpoint();
          s.setPose(p);
        }}
      />
      <div className="grid grid-cols-3 gap-1.5 text-xs tabular-nums">
        {lengths.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-md bg-surface-2/80 px-2 py-1">
            <span aria-hidden className="size-2 rounded-full" style={{ background: PISTON_COLORS[i] }} />
            <span className="font-medium">P{i + 1}</span>
            <span className="ml-auto">{fmt(l, 1)}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">Aqui os seis pistões se ajustam juntos (cinemática inversa). Clique no ponto do tampo para trocar o eixo, ou use Z, R, P e Y.</p>
    </div>
  );
}

function SelectionPanel() {
  const selection = useBench((s) => s.selection);
  if (selection.kind === 'piston') return <PistonPanel index={selection.index} />;
  if (selection.kind === 'platform') return <PlatformPanel axis={selection.axis} />;
  return (
    <div className="space-y-2 text-sm">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <MousePointerClick aria-hidden className="size-5 text-brand" />
        Comece aqui
      </h2>
      <p className="text-muted">Clique num pistão para mudar só o comprimento dele, ou no ponto verde do tampo para mover a plataforma inteira (Z, roll, pitch e yaw).</p>
      <p className="text-muted">Pelo teclado: foque o modelo e use 1 a 6 para os pistões, C para o tampo e as setas para ajustar.</p>
    </div>
  );
}

function LimitNotice() {
  const limit = useBench((s) => s.limit);
  return (
    <p role="status" aria-live="polite" className={cn('min-h-5 text-sm font-medium text-danger', !limit && 'sr-only')}>
      {limit?.reason ?? ''}
    </p>
  );
}

// ---------------- página ----------------
export default function BenchPage() {
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const selection = useBench((s) => s.selection);
  const historyLen = useBench((s) => s.history.length);
  const [quality, setQuality] = useState<Quality>('alta');
  const [showReal, setShowReal] = useState(true);
  const [live, setLive] = useState(false);
  const [view, setView] = useState<CameraView>('iso');
  const [viewNonce, setViewNonce] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(stage);

  useEffect(() => {
    document.title = 'Bancada 3D · Plataforma de Stewart · IFSP';
  }, []);
  useEffect(() => useBench.getState().init(geometry), [geometry]);
  useAutoDisable(live, () => setLive(false));

  const background = useMemo(() => {
    void theme;
    return getComputedStyle(document.documentElement).getPropertyValue('--c-scene-bg').trim() || '#101010';
  }, [theme]);

  async function apply(quiet = false) {
    try {
      const r = await api.applyPose(useBench.getState().pose, 'bancada');
      if (!r.applied && !quiet) toast.error('Pose não aplicada', { description: r.message });
      else if (!quiet) toast.success(simulated ? 'Aplicado no simulador' : 'Aplicado na plataforma');
    } catch (err) {
      setLive(false);
      toast.error('Erro ao aplicar', { description: (err as Error).message });
    }
  }

  // ao vivo: segue a edição a até 10 Hz, sem re-renderizar a página
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSent = 0;
    const unsub = useBench.subscribe((s, prev) => {
      if (s.pose === prev.pose) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        lastSent = Date.now();
        void apply(true);
      }, Math.max(0, LIVE_MS - (Date.now() - lastSent)));
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const s = useBench.getState();
    const k = e.key.toLowerCase();
    if (/^[1-6]$/.test(k)) s.select({ kind: 'piston', index: Number(k) - 1 });
    else if (k === 'c' || k === '0') s.cycleAxis();
    else if (k === 'z' && (e.ctrlKey || e.metaKey)) s.undo();
    else if (['z', 'r', 'p', 'y'].includes(k)) s.select({ kind: 'platform', axis: ({ z: 'z', r: 'roll', p: 'pitch', y: 'yaw' } as const)[k as 'z' | 'r' | 'p' | 'y'] });
    else if (k === 'f') toggleFullscreen();
    else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      const sign = k === 'arrowup' || k === 'arrowright' ? 1 : -1;
      const angular = s.selection.kind === 'platform' && s.selection.axis !== 'z';
      const step = (angular ? 0.5 : 1) * (e.shiftKey ? 10 : 1);
      s.checkpoint();
      s.nudge(sign * step);
    } else return;
    e.preventDefault();
  }

  const selLabel =
    selection.kind === 'piston' ? `pistão ${selection.index + 1} selecionado` : selection.kind === 'platform' ? `plataforma selecionada, eixo ${AXIS_LABEL[selection.axis]}` : 'nada selecionado';

  return (
    <div ref={stage} className={stageClass}>
      {/* canvas em tela cheia; o HUD fica por cima */}
      {/* região do modelo: widget próprio (role=application) com teclado documentado em #bancada-instrucoes */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <div
        role="application"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        aria-label={`Modelo 3D interativo da bancada, ${selLabel}.`}
        aria-describedby="bancada-instrucoes"
        onKeyDown={onKeyDown}
        className="absolute inset-0 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <Canvas
          shadows
          frameloop="demand"
          dpr={quality === 'alta' ? [1, 2] : [1, 1.25]}
          camera={{ position: [1600, -1850, 1200], up: [0, 0, 1], fov: 30, near: 5, far: 20000 }}
          gl={{ antialias: quality !== 'alta', toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}
        >
          <BenchScene
            geometry={geometry}
            quality={quality}
            onDecline={() => {
              if (quality === 'alta') {
                setQuality('leve');
                toast.info('Qualidade reduzida para manter a fluidez', { description: 'Você pode voltar para Alta no rodapé.' });
              }
            }}
            showReal={showReal}
            background={background}
            view={view}
            viewNonce={viewNonce}
          />
        </Canvas>
      </div>
      <p id="bancada-instrucoes" className="sr-only">
        Teclas: 1 a 6 selecionam um pistão; C seleciona o tampo e alterna o eixo; Z, R, P e Y escolhem altura, roll, pitch ou yaw; setas ajustam
        (Shift multiplica por 10); Ctrl+Z desfaz; F alterna a tela cheia. O painel ao lado tem os mesmos controles.
      </p>

      {/* topo esquerdo: título, modo e pose */}
      <div className={cn(glass, 'absolute left-3 top-3 w-[min(22rem,calc(100%-1.5rem))] space-y-3 p-3 sm:left-4 sm:top-4')}>
        <div className="flex items-center justify-between gap-2">
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <Box aria-hidden className="size-5 text-brand" />
            Bancada 3D
          </h1>
          {fullscreen && <ModeBadge />}
        </div>
        <PoseReadout />
        <LimitNotice />
      </div>

      {/* topo direito: parar em tela cheia */}
      {fullscreen && (
        <div className="absolute right-4 top-4">
          <EmergencyStopButton showShortcut={false} />
        </div>
      )}

      {/* painel de seleção */}
      <aside
        aria-label="Painel de edição"
        className={cn(
          glass,
          'absolute inset-x-3 bottom-[5.5rem] max-h-[45%] overflow-y-auto p-4',
          'lg:inset-x-auto lg:bottom-auto lg:right-4 lg:w-[23rem] lg:max-h-[calc(100%-9rem)]',
          fullscreen ? 'lg:top-20' : 'lg:top-4',
        )}
      >
        <SelectionPanel />
      </aside>

      {/* rodapé: seleção, envio, câmera e tela cheia */}
      <div className={cn(glass, 'absolute inset-x-3 bottom-3 flex flex-wrap items-center gap-2 p-2 sm:inset-x-4 sm:bottom-4')}>
        <div role="group" aria-label="Selecionar" className="flex flex-wrap gap-1">
          {PISTONS.map((p, i) => {
            const active = selection.kind === 'piston' && selection.index === i;
            return (
              <Button
                key={p}
                size="sm"
                variant={active ? 'primary' : 'ghost'}
                aria-pressed={active}
                onClick={() => useBench.getState().select({ kind: 'piston', index: i })}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ background: PISTON_COLORS[i] }} />P{p}
              </Button>
            );
          })}
          <Button
            size="sm"
            variant={selection.kind === 'platform' ? 'primary' : 'ghost'}
            aria-pressed={selection.kind === 'platform'}
            onClick={() => useBench.getState().cycleAxis()}
          >
            Tampo{selection.kind === 'platform' && ` · ${AXIS_LABEL[selection.axis]}`}
          </Button>
        </div>

        <span aria-hidden className="mx-1 hidden h-6 w-px bg-border lg:block" />

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => apply()} disabled={!canCommand || live}>
            <Send aria-hidden />
            Aplicar {simulated ? 'no simulador' : 'na plataforma'}
          </Button>
          <AddKeyButton size="sm" variant="ghost" getPose={() => useBench.getState().pose} />
          <div className="rounded-lg px-2">
            <SwitchField label="Ao vivo" checked={live} onCheckedChange={setLive} disabled={!canCommand} tone="danger" />
          </div>
          <Button size="sm" variant="ghost" onClick={() => useBench.getState().undo()} disabled={historyLen === 0} aria-label="Desfazer (Ctrl+Z)">
            <Undo2 aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useBench.getState().resetHome()} aria-label="Voltar ao home">
            <Home aria-hidden />
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {(Object.keys(CAMERA_VIEWS) as CameraView[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? 'secondary' : 'ghost'}
              aria-pressed={view === v}
              onClick={() => {
                setView(v);
                setViewNonce((n) => n + 1);
              }}
            >
              {CAMERA_VIEWS[v].label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setShowReal((r) => !r)} aria-pressed={showReal} title="Sobrepor a pose medida (telemetria)">
            {showReal ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            Real
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setQuality((q) => (q === 'alta' ? 'leve' : 'alta'))}
            aria-label={`Qualidade ${quality === 'alta' ? 'alta' : 'leve'}; alternar`}
            title="Alta: oclusão de ambiente, bloom e sombras em alta resolução"
          >
            {quality === 'alta' ? <Sparkles aria-hidden /> : <Gauge aria-hidden />}
            {quality === 'alta' ? 'Alta' : 'Leve'}
          </Button>
          <Button size="sm" variant="secondary" onClick={toggleFullscreen} aria-pressed={fullscreen} aria-keyshortcuts="F">
            {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
            {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
          </Button>
        </div>
      </div>
    </div>
  );
}
