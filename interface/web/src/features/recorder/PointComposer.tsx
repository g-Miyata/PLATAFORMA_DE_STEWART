import { Home, MapPinPlus, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { sceneBackground } from '@/components/Stage';
import { Button } from '@/components/ui/button';
import { NumberField, SwitchField } from '@/components/ui/field';
import { BenchScene } from '@/features/bench3d/BenchScene';
import { useBench } from '@/features/bench3d/benchStore';
import { PoseEditor } from '@/features/control/PoseEditor';
import { useAutoDisable } from '@/features/control/useControlGate';
import { useGeometry } from '@/features/platform3d/geometry';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { Pose } from '@/lib/types';
import { useUi } from '@/stores/ui';

const LIVE_MS = 100;

/**
 * Ponto a ponto: posicione a plataforma (no modelo 3D, como na Bancada 3D, ou pelos
 * valores) e grave o ponto. A rotina liga os pontos, com o intervalo escolhido entre eles.
 */
export function PointComposer({ canCommand, points, onRecordPoint }: { canCommand: boolean; points: number; onRecordPoint: (pose: Pose, gapS: number) => void }) {
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const pose = useBench((s) => s.pose);
  const limit = useBench((s) => s.limit);
  const historyLen = useBench((s) => s.history.length);
  const [gap, setGap] = useState(2);
  const [live, setLive] = useState(false);
  const background = useMemo(() => {
    void theme;
    return sceneBackground();
  }, [theme]);

  useEffect(() => useBench.getState().init(geometry), [geometry]);
  useAutoDisable(live, () => setLive(false));

  // ao vivo: a plataforma acompanha a edição (até 10 Hz)
  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastSent = 0;
    const send = async () => {
      lastSent = Date.now();
      try {
        const r = await api.applyPose(useBench.getState().pose, 'bancada');
        if (!r.applied) toast.error('Pose não aplicada', { description: r.message });
      } catch (err) {
        setLive(false);
        toast.error('Ao vivo interrompido', { description: (err as Error).message });
      }
    };
    void send();
    const unsub = useBench.subscribe((s, prev) => {
      if (s.pose === prev.pose) return;
      clearTimeout(timer);
      timer = setTimeout(send, Math.max(0, LIVE_MS - (Date.now() - lastSent)));
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [live]);

  const s = useBench.getState;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="relative h-80 overflow-hidden rounded-xl border border-border sm:h-96" aria-hidden>
        <Canvas
          shadows
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: [1500, -1750, 1150], up: [0, 0, 1], fov: 32, near: 5, far: 20000 }}
          gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}
        >
          <BenchScene geometry={geometry} quality="leve" onDecline={() => undefined} showReal={live} background={background} view="iso" viewNonce={0} />
        </Canvas>
        <p className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-surface/85 px-2 py-1 text-xs text-muted backdrop-blur">
          Clique num pistão e arraste a seta, ou no ponto verde do tampo para mover a plataforma inteira.
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        <PoseEditor
          pose={pose}
          onChange={(p) => {
            s().checkpoint();
            s().setPose(p);
          }}
        />
        <p role="status" className={cn('text-sm font-medium text-danger', !limit && 'sr-only')}>
          {limit ? `Não cabe: ${limit.reason}` : ''}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <NumberField label="Tempo até este ponto" unit="s" value={gap} min={0.5} max={60} step={0.5} onValueChange={(v) => setGap(Math.min(60, Math.max(0.5, v)))} className="w-40" hint={points ? 'depois do ponto anterior' : 'o primeiro ponto fica em 0 s'} />
          <Button variant="primary" size="lg" onClick={() => onRecordPoint({ ...s().pose }, gap)}>
            <MapPinPlus aria-hidden />
            Gravar ponto {points + 1}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              s().checkpoint();
              s().resetHome();
            }}
          >
            <Home aria-hidden />
            Home
          </Button>
          <Button variant="ghost" size="sm" onClick={() => s().undo()} disabled={historyLen === 0}>
            <Undo2 aria-hidden />
            Desfazer
          </Button>
          <div className="ml-auto">
            <SwitchField label="Mover a plataforma junto" checked={live} onCheckedChange={setLive} disabled={!canCommand} tone="danger" />
          </div>
        </div>
        {!canCommand && <p className="text-xs text-muted">Conecte o simulador ou a bancada no topo para ver a plataforma acompanhar. Gravar pontos funciona sem conexão.</p>}
      </div>
    </div>
  );
}
