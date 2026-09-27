import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGeometry } from '@/features/platform3d/geometry';
import { Scene } from '@/features/platform3d/Scene';
import { SceneStore } from '@/features/platform3d/sceneState';
import { cn } from '@/lib/cn';
import { solvePose } from '@/lib/kinematics';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';
import { useUi } from '@/stores/ui';

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#101010';
}

interface Snapshot {
  live: Pose | null;
  strokes: number[] | null;
}

/**
 * O que a plataforma (ou o simulador) fez com os comandos do celular: modelo 3D com a
 * pose medida (a comandada aparece como fantasma) e o curso de cada pistão, medido ×
 * comandado. Sem telemetria, mostra só a pose comandada.
 */
export function LiveResponse({ target, className }: { target: Pose | null; className?: string }) {
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const serial = useConnection((s) => s.serial);
  const [store] = useState(() => new SceneStore(geometry, false, 'auto'));
  const [snap, setSnap] = useState<Snapshot>({ live: null, strokes: null });

  useEffect(() => store.setTarget(target), [store, target]);
  useEffect(() => store.setGeometry(geometry), [store, geometry]);
  useEffect(
    () =>
      useTelemetry.subscribe((s) => {
        if (s.telemetry?.pose_live) store.setLive(s.telemetry.pose_live);
      }),
    [store],
  );
  // números a 5 Hz (o 3D segue a telemetria direto, sem re-render)
  useEffect(() => {
    const id = setInterval(() => {
      const t = useTelemetry.getState().telemetry;
      const fresh = !!t && Date.now() / 1000 - t.ts < 1.5;
      setSnap({ live: fresh ? store.freshLive() : null, strokes: fresh && t?.Y?.length === 6 ? t.Y : null });
    }, 200);
    return () => clearInterval(id);
  }, [store]);

  const colors = useMemo(() => {
    void theme;
    return { bg: cssVar('--c-scene-bg'), grid: cssVar('--c-scene-grid') };
  }, [theme]);

  // não desenha fora da tela
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const range = geometry.stroke_max - geometry.stroke_min;
  const cmd = target ? solvePose(target, geometry).lengths.map((l) => l - geometry.stroke_min) : null;
  const source = !serial.connected ? null : serial.simulated ? 'Simulador' : 'Bancada';
  const label = snap.live ? `${source ?? 'Plataforma'} (medido)` : serial.connected ? 'Esperando a telemetria…' : 'Sem bancada: só o comando';
  const live = snap.live;

  return (
    <section aria-label="Resposta da plataforma" className={cn('space-y-2', className)}>
      <div ref={box} className="pointer-events-none relative h-40 overflow-hidden rounded-xl border border-border bg-surface-2 min-[420px]:h-48" aria-hidden>
        <Canvas
          dpr={[1, 1.5]}
          frameloop={visible ? 'always' : 'never'}
          camera={{ position: [1500, -1700, 1150], up: [0, 0, 1], fov: 35, near: 5, far: 20000 }}
          gl={{ antialias: true }}
        >
          <Scene geometry={geometry} store={store} background={colors.bg} gridColor={colors.grid} view="iso" viewNonce={0} />
        </Canvas>
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-surface/85 px-2 py-0.5 text-xs font-medium backdrop-blur">{label}</span>
        {live && target && <span className="absolute bottom-2 right-2 rounded-md bg-surface/85 px-2 py-0.5 text-xs text-muted backdrop-blur">fantasma = comando</span>}
      </div>

      <p className="text-center text-xs tabular-nums min-[420px]:text-sm">
        {live ? (
          <>
            <span className="text-muted">Medido:</span> roll {fmt(live.roll, 1)}° · pitch {fmt(live.pitch, 1)}° · Z {fmt(live.z, 0)} mm
          </>
        ) : (
          <span className="text-muted">Sem resposta: conecte o simulador ou a bancada.</span>
        )}
      </p>

      {/* curso de cada pistão: barra = medido, traço = comandado */}
      <div
        className="grid grid-cols-6 gap-1"
        role="img"
        aria-label={snap.strokes ? `Curso medido dos pistões: ${snap.strokes.map((v) => fmt(v, 0)).join(', ')} milímetros` : 'Curso dos pistões sem telemetria'}
      >
        {PISTON_COLORS.map((c, i) => {
          const m = snap.strokes?.[i];
          const k = cmd?.[i];
          return (
            <div key={i} className="space-y-0.5 text-center">
              <div className="relative h-7 overflow-hidden rounded-md bg-surface-2">
                {m !== undefined && (
                  <div
                    className="absolute inset-x-0 bottom-0 transition-[height] duration-200"
                    style={{ height: `${Math.max(0, Math.min(1, m / range)) * 100}%`, background: c, opacity: 0.85 }}
                  />
                )}
                {k !== undefined && <div className="absolute inset-x-0 h-0.5 bg-fg" style={{ bottom: `${Math.max(0, Math.min(1, k / range)) * 100}%` }} />}
              </div>
              <p className="text-[11px] tabular-nums text-muted">
                P{i + 1} {m !== undefined ? fmt(m, 0) : '–'}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
