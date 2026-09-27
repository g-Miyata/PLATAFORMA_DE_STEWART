import { Canvas } from '@react-three/fiber';
import { Home, Maximize2, Minimize2, Minus, Plus, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import * as THREE from 'three';
import { sceneBackground } from '@/components/Stage';
import { Button } from '@/components/ui/button';
import { SwitchField } from '@/components/ui/field';
import { BenchScene } from '@/features/bench3d/BenchScene';
import { AXIS_LABEL, PLATFORM_AXES, useBench } from '@/features/bench3d/benchStore';
import { useAutoDisable } from '@/features/control/useControlGate';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import { useGeometry } from '@/features/platform3d/geometry';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import { useUi } from '@/stores/ui';

const LIVE_MS = 100;
const REPEAT_MS = 110;

/** Botão que repete enquanto o dedo fica em cima (−/+ grandes para o toque). */
function HoldButton({ label, onStep, children, disabled, className }: { label: string; onStep: () => void; children: React.ReactNode; disabled?: boolean; className?: string }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  return (
    <Button
      variant="secondary"
      size="lg"
      className={cn('h-16 flex-1 touch-none text-xl', className)}
      aria-label={label}
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onStep();
        stop();
        timer.current = setInterval(onStep, REPEAT_MS);
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onStep())}
    >
      {children}
    </Button>
  );
}

/**
 * Bancada 3D adaptada ao toque: um dedo gira, dois dão zoom; os botões grandes movem.
 * Em tela cheia, o modelo ocupa o celular inteiro e os controles ficam embaixo.
 * O fantasma mostra a pose medida (a resposta do simulador ou da bancada).
 */
export function TouchBench({ canCommand }: { canCommand: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const selection = useBench((s) => s.selection);
  const lengths = useBench((s) => s.lengths);
  const pose = useBench((s) => s.pose);
  const limit = useBench((s) => s.limit);
  const historyLen = useBench((s) => s.history.length);
  const [live, setLive] = useState(false);
  const background = useMemo(() => {
    void theme;
    return sceneBackground();
  }, [theme]);

  useEffect(() => useBench.getState().init(geometry), [geometry]);

  // tela cheia de verdade onde o navegador deixa (Android); no iPhone fica só o layout
  async function toggleFull() {
    if (full) {
      setFull(false);
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      return;
    }
    setFull(true);
    await root.current?.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined);
  }
  useEffect(() => {
    const on = () => !document.fullscreenElement && setFull(false);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useAutoDisable(live, () => setLive(false));

  // ao vivo: segue a edição a até 10 Hz
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSent = 0;
    const unsub = useBench.subscribe((s, prev) => {
      if (s.pose === prev.pose) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        lastSent = Date.now();
        try {
          const r = await api.applyPose(useBench.getState().pose, 'bancada');
          if (!r.applied) toast.error('Pose não aplicada', { description: r.message });
        } catch (err) {
          setLive(false);
          toast.error('Ao vivo interrompido', { description: (err as Error).message });
        }
      }, Math.max(0, LIVE_MS - (Date.now() - lastSent)));
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [live]);

  const s = useBench.getState;
  const step = (sign: number) => {
    const sel = s().selection;
    const angular = sel.kind === 'platform' && sel.axis !== 'z';
    s().checkpoint();
    s().nudge(sign * (angular ? 0.5 : 2));
  };
  const selected =
    selection.kind === 'piston'
      ? `Pistão ${selection.index + 1}: ${fmt(lengths[selection.index] - geometry.stroke_min, 0)} mm de curso`
      : selection.kind === 'platform'
        ? `Tampo · ${AXIS_LABEL[selection.axis]}: ${fmt(pose[selection.axis], 1)}${selection.axis === 'z' ? ' mm' : '°'}`
        : 'Toque num pistão ou no tampo';

  return (
    <div ref={root} className={cn(full ? 'fixed inset-0 z-50 flex flex-col bg-bg' : 'space-y-3')}>
      <div className={cn('relative touch-none overflow-hidden', full ? 'min-h-0 flex-1' : 'h-[52dvh] min-h-64 rounded-xl border border-border')}>
        <div className="absolute inset-0" aria-hidden>
          <Canvas
            shadows
            frameloop="demand"
            dpr={[1, 1.5]}
            camera={{ position: [1600, -1850, 1200], up: [0, 0, 1], fov: 34, near: 5, far: 20000 }}
            gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}
          >
            <BenchScene geometry={geometry} quality="leve" onDecline={() => undefined} showReal background={background} view="iso" viewNonce={0} />
          </Canvas>
        </div>
        <div
          className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2"
          style={full ? { top: 'max(0.5rem, env(safe-area-inset-top))' } : undefined}
        >
          <p className="rounded-md bg-surface/85 px-2 py-1 text-sm font-medium backdrop-blur" aria-live="polite">
            {selected}
          </p>
          <div className="pointer-events-auto flex items-center gap-1.5">
            {full && <EmergencyStopButton showShortcut={false} />}
            <Button size="icon" variant="secondary" onClick={toggleFull} aria-label={full ? 'Sair da tela cheia' : 'Bancada em tela cheia'} title={full ? 'Sair da tela cheia' : 'Tela cheia'}>
              {full ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
            </Button>
          </div>
        </div>
        <p className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-surface/85 px-2 py-0.5 text-xs text-muted backdrop-blur">fantasma = pose medida</p>
      </div>
      <div
        className={cn(full ? 'space-y-2 border-t border-border bg-surface/95 px-3 pt-2 backdrop-blur' : 'space-y-3')}
        style={full ? { paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' } : undefined}
      >
      <p role="status" className={cn('min-h-5 text-center text-sm font-medium text-danger', !limit && 'sr-only')}>
        {limit?.reason}
      </p>
      <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="O que mover">
        {PISTON_COLORS.map((c, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={selection.kind === 'piston' && selection.index === i}
            onClick={() => s().select({ kind: 'piston', index: i })}
            className="h-11 rounded-lg border-2 text-sm font-bold aria-pressed:text-black"
            style={selection.kind === 'piston' && selection.index === i ? { background: c, borderColor: c } : { borderColor: c }}
          >
            P{i + 1}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={selection.kind === 'platform'}
          onClick={() => s().select({ kind: 'platform', axis: selection.kind === 'platform' ? selection.axis : 'z' })}
          className="h-11 rounded-lg border-2 border-border-strong text-sm font-bold aria-pressed:bg-primary aria-pressed:text-on-primary"
        >
          Tampo
        </button>
      </div>
      {selection.kind === 'platform' && (
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Eixo do tampo">
          {PLATFORM_AXES.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={selection.axis === a}
              onClick={() => s().select({ kind: 'platform', axis: a })}
              className="h-10 rounded-lg border border-border text-sm font-medium aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-on-primary"
            >
              {AXIS_LABEL[a]}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <HoldButton label="Diminuir" onStep={() => step(-1)} disabled={selection.kind === 'none'} className={full ? 'h-12' : undefined}>
          <Minus aria-hidden />
        </HoldButton>
        <HoldButton label="Aumentar" onStep={() => step(1)} disabled={selection.kind === 'none'} className={full ? 'h-12' : undefined}>
          <Plus aria-hidden />
        </HoldButton>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => s().undo()} disabled={historyLen === 0}>
          <Undo2 aria-hidden />
          Desfazer
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            s().checkpoint();
            s().resetHome();
          }}
        >
          <Home aria-hidden />
          Home
        </Button>
        <div className="ml-auto">
          <SwitchField label="Ao vivo" checked={live} onCheckedChange={setLive} disabled={!canCommand} tone="danger" />
        </div>
      </div>
      </div>
    </div>
  );
}
