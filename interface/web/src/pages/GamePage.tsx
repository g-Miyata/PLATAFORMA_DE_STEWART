import { ChevronLeft, ChevronRight, Maximize, Minimize, Pause, Play, RotateCcw, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { toast } from 'sonner';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { ModeBadge } from '@/components/ModeBadge';
import { glass, sceneBackground, stageClass, useFullscreen } from '@/components/Stage';
import { Button } from '@/components/ui/button';
import { SwitchField } from '@/components/ui/field';
import { useAutoDisable, useCanCommand } from '@/features/control/useControlGate';
import { FREE, GameEngine, MIRROR, type GamePhase } from '@/features/game/engine';
import { GameScene } from '@/features/game/GameScene';
import { LEVELS } from '@/features/game/levels';
import { useGamepad } from '@/features/joystick/gamepad';
import { convexHull, DIM, offsetConvex, useGeometry, xy } from '@/features/platform3d/geometry';
import { EmergencyStopButton } from '@/features/safety/EmergencyStopButton';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { useTelemetry } from '@/stores/telemetry';
import { useUi } from '@/stores/ui';

const BEST_KEY = 'stewart-game-best';
const SEND_MS = 100;

function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, 1],
  KeyW: [0, 1],
  ArrowDown: [0, -1],
  KeyS: [0, -1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

const PHASE_TEXT: Record<GamePhase, string> = {
  pronto: 'Incline para começar',
  jogando: 'Valendo!',
  pausado: 'Pausado',
  caiu: 'Caiu no buraco! Recomeçando…',
  venceu: 'Chegou!',
};

export default function GamePage() {
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const canCommand = useCanCommand();
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(stage);
  const outline = useMemo(() => offsetConvex(convexHull(xy(geometry.platform_points_local)), DIM.topMargin), [geometry]);
  const [engine] = useState(() => new GameEngine(outline));
  const [phase, setPhase] = useState<GamePhase>('pronto');
  const [levelIndex, setLevelIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [best, setBest] = useState(loadBest);
  const [mirror, setMirror] = useState(false);
  const [followReal, setFollowReal] = useState(false);
  const keys = useRef(new Set<string>());
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<[number, number]>([0, 0]);
  const pad = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    document.title = 'Jogo da bolinha · Plataforma de Stewart · IFSP';
  }, []);
  const background = useMemo(() => {
    void theme;
    return sceneBackground();
  }, [theme]);

  // eventos do motor → estado da página
  useEffect(() => {
    engine.setListener((p) => {
      setPhase(p);
      if (p === 'venceu') {
        const t = engine.elapsed;
        const id = engine.level.id;
        setBest((b) => {
          if (b[id] !== undefined && b[id] <= t) return b;
          const next = { ...b, [id]: t };
          try {
            localStorage.setItem(BEST_KEY, JSON.stringify(next));
          } catch {
            /* sem storage */
          }
          toast.success('Novo recorde!', { description: `${engine.level.name}: ${fmt(t, 1)} s` });
          return next;
        });
      }
    });
    return () => engine.setListener(() => {});
  }, [engine]);

  // relógio do HUD (10 Hz)
  useEffect(() => {
    const id = setInterval(() => setElapsed(engine.elapsed), 100);
    return () => clearInterval(id);
  }, [engine]);

  // entrada: teclado, gamepad (stick esquerdo) e arrastar
  const updateInput = useCallback(() => {
    let x = 0;
    let y = 0;
    for (const k of keys.current) {
      const d = KEYS[k];
      if (d) {
        x += d[0];
        y += d[1];
      }
    }
    if (pointer.current) {
      x = pointer.current.x;
      y = pointer.current.y;
    }
    if (pad.current[0] || pad.current[1]) [x, y] = pad.current;
    engine.setInput(x, y);
  }, [engine]);

  useGamepad((s) => {
    pad.current = [s.lx, -s.ly];
    updateInput();
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (KEYS[e.code]) {
        e.preventDefault();
        keys.current.add(e.code);
        updateInput();
      } else if (e.code === 'Space' || e.code === 'KeyP') {
        e.preventDefault();
        engine.togglePause();
      } else if (e.code === 'KeyR') engine.restart();
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(e.code);
      updateInput();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [engine, updateInput]);

  function onPointer(e: PointerEvent<HTMLDivElement>) {
    if (e.type === 'pointerdown') {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      pointer.current = { x: 0, y: 0 };
      dragOrigin.current = [e.clientX, e.clientY];
    } else if (e.type === 'pointermove' && pointer.current) {
      const [ox, oy] = dragOrigin.current;
      pointer.current = { x: Math.max(-1, Math.min(1, (e.clientX - ox) / 160)), y: Math.max(-1, Math.min(1, -(e.clientY - oy) / 160)) };
    } else {
      pointer.current = null;
    }
    updateInput();
  }

  // espelhar na plataforma: limites mais conservadores e envio a 10 Hz
  useAutoDisable(mirror, () => setMirror(false));
  useEffect(() => {
    engine.setOptions(mirror ? MIRROR : FREE);
    if (!mirror) {
      engine.setExternal(null);
      return;
    }
    let busy = false;
    const id = setInterval(async () => {
      if (followReal) {
        const live = useTelemetry.getState().telemetry?.pose_live;
        engine.setExternal(live ? { roll: live.roll, pitch: live.pitch } : null);
      } else engine.setExternal(null);
      if (busy) return;
      busy = true;
      try {
        await api.applyPose({ x: 0, y: 0, z: geometry.home_z, roll: engine.tilt.roll, pitch: engine.tilt.pitch, yaw: 0 }, 'jogo');
      } catch (err) {
        setMirror(false);
        toast.error('Espelhamento interrompido', { description: (err as Error).message });
      } finally {
        busy = false;
      }
    }, SEND_MS);
    return () => {
      clearInterval(id);
      engine.setExternal(null);
    };
  }, [mirror, followReal, engine, geometry.home_z]);

  const home = geometry.home_z;
  const getPose = useCallback((): Pose => {
    const t = engine.external ?? engine.tilt;
    return { x: 0, y: 0, z: home, roll: t.roll, pitch: t.pitch, yaw: 0 };
  }, [engine, home]);

  function goLevel(i: number) {
    engine.setLevel(i);
    setLevelIndex(engine.levelIndex);
  }

  const level = LEVELS[levelIndex];
  const levelBest = best[level.id];

  return (
    <div ref={stage} className={stageClass}>
      {/* arrastar é atalho; o teclado e o gamepad fazem o mesmo */}
      <div className="absolute inset-0 touch-none" onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={onPointer} onPointerCancel={onPointer} aria-hidden>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [-1350, 0, 1750], up: [0, 0, 1], fov: 32, near: 5, far: 20000 }}
          gl={{ toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}
        >
          <GameScene engine={engine} geometry={geometry} outline={outline} getPose={getPose} background={background} levelKey={levelIndex} />
        </Canvas>
      </div>

      <div className={cn(glass, 'absolute left-3 top-3 w-[min(22rem,calc(100%-1.5rem))] space-y-3 p-3 sm:left-4 sm:top-4')}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Jogo da bolinha</h1>
          {fullscreen && <ModeBadge />}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Fase {levelIndex + 1} de {LEVELS.length}
          </p>
          <p className="text-lg font-semibold">{level.name}</p>
          <p className="text-sm text-muted">{level.hint}</p>
        </div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-semibold tabular-nums">{fmt(elapsed, 1)} s</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <Trophy aria-hidden className="size-3.5" />
              Recorde: {levelBest !== undefined ? `${fmt(levelBest, 1)} s` : '—'}
            </p>
          </div>
          <p role="status" aria-live="polite" className={cn('text-right text-sm font-semibold', phase === 'caiu' ? 'text-danger' : phase === 'venceu' ? 'text-brand-text' : 'text-muted')}>
            {phase === 'venceu' ? `Chegou em ${fmt(engine.elapsed, 1)} s!` : PHASE_TEXT[phase]}
          </p>
        </div>
        {phase === 'venceu' && levelIndex < LEVELS.length - 1 && (
          <Button variant="primary" className="w-full" onClick={() => goLevel(levelIndex + 1)}>
            Próxima fase
            <ChevronRight aria-hidden />
          </Button>
        )}
      </div>

      <div className={cn(glass, 'absolute right-3 top-3 w-[min(20rem,calc(100%-1.5rem))] space-y-3 p-3 text-sm sm:right-4 sm:top-4')}>
        <h2 className="font-semibold">Como jogar</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted">
          <li>Setas ou W A S D inclinam o tampo (↑ afasta a bolinha da câmera).</li>
          <li>Também dá para arrastar com o mouse ou usar o stick esquerdo do gamepad.</li>
          <li>Espaço pausa; R recomeça a fase.</li>
        </ul>
        <div className="space-y-2 border-t border-border pt-3">
          <SwitchField
            label="Espelhar na plataforma"
            description="A bancada inclina junto (até 5°, devagar)."
            checked={mirror}
            onCheckedChange={setMirror}
            disabled={!canCommand}
            tone="danger"
          />
          {mirror && <SwitchField label="Bolinha segue a plataforma real" description="A física usa a inclinação medida, com o atraso dos atuadores." checked={followReal} onCheckedChange={setFollowReal} />}
          {!canCommand && <p className="text-xs text-muted">Conecte o simulador ou a bancada no topo para espelhar.</p>}
        </div>
      </div>

      <div className={cn(glass, 'absolute inset-x-3 bottom-3 flex flex-wrap items-center justify-center gap-2 p-2 sm:inset-x-4 sm:bottom-4')}>
        <Button size="sm" variant="secondary" onClick={() => goLevel(levelIndex - 1)} disabled={levelIndex === 0}>
          <ChevronLeft aria-hidden />
          Fase anterior
        </Button>
        <Button size="sm" variant="secondary" onClick={() => engine.togglePause()} disabled={phase !== 'jogando' && phase !== 'pausado'} aria-pressed={phase === 'pausado'}>
          {phase === 'pausado' ? <Play aria-hidden /> : <Pause aria-hidden />}
          {phase === 'pausado' ? 'Continuar' : 'Pausar'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => engine.restart()}>
          <RotateCcw aria-hidden />
          Recomeçar
        </Button>
        <Button size="sm" variant="secondary" onClick={() => goLevel(levelIndex + 1)} disabled={levelIndex === LEVELS.length - 1}>
          Próxima fase
          <ChevronRight aria-hidden />
        </Button>
        <span aria-hidden className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <Button size="sm" variant="secondary" onClick={toggleFullscreen} aria-pressed={fullscreen}>
          {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
          {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </Button>
        {mirror && <EmergencyStopButton />}
      </div>
    </div>
  );
}
