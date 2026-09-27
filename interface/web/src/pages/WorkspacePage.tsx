import { Crosshair, ExternalLink, Info, Loader2, Maximize, Minimize } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { ModeBadge } from '@/components/ModeBadge';
import { glass, sceneBackground, stageClass, useFullscreen } from '@/components/Stage';
import { Button } from '@/components/ui/button';
import { SelectField, SliderField, SwitchField } from '@/components/ui/field';
import { DEFAULT_LIMITS, PoseEditor, type PoseLimits } from '@/features/control/PoseEditor';
import { physicalLimits } from '@/lib/limits';
import { useGeometry } from '@/features/platform3d/geometry';
import { usePositionField, useTiltField } from '@/features/workspace/useWorkspace';
import { axisReach, LIMIT_LABELS, makeLimiter } from '@/features/workspace/workspace';
import { LIMIT_COLORS } from '@/features/workspace/WorkspaceScene';
import { useLimits } from '@/features/platform3d/geometry';
import { WorkspaceScene } from '@/features/workspace/WorkspaceScene';
import { cn } from '@/lib/cn';
import { zeroPose } from '@/lib/kinematics';
import { fmt } from '@/lib/pistons';
import type { Pose } from '@/lib/types';
import { useTelemetry } from '@/stores/telemetry';
import { useUi } from '@/stores/ui';

type Mode = 'posicao' | 'inclinacao';
const RESOLUTION = { rapida: 48, fina: 96 } as const;
const WIDE: PoseLimits = { x: [-300, 300], y: [-300, 300], z: [380, 700], roll: [-30, 30], pitch: [-30, 30], yaw: [-30, 30] };

const AXES: { key: keyof Pose; label: string; unit: string }[] = [
  { key: 'x', label: 'X', unit: 'mm' },
  { key: 'y', label: 'Y', unit: 'mm' },
  { key: 'z', label: 'Z', unit: 'mm' },
  { key: 'roll', label: 'Roll', unit: '°' },
  { key: 'pitch', label: 'Pitch', unit: '°' },
  { key: 'yaw', label: 'Yaw', unit: '°' },
];

/** Inclinação máxima por direção: +roll à direita, +pitch para cima. */
function TiltPolar({ data }: { data: { phi: number; max: number }[] }) {
  const R = 100;
  const maxRing = 25;
  const pts = data.map((d) => {
    const r = (Math.min(d.max, maxRing) / maxRing) * R;
    const a = (d.phi * Math.PI) / 180;
    return `${(r * Math.cos(a)).toFixed(1)},${(-r * Math.sin(a)).toFixed(1)}`;
  });
  const min = data.reduce((m, d) => (d.max < m.max ? d : m), data[0]);
  const max = data.reduce((m, d) => (d.max > m.max ? d : m), data[0]);
  return (
    <figure className="space-y-2">
      <svg viewBox="-125 -125 250 250" className="mx-auto block w-full max-w-64" role="img" aria-label={`Inclinação máxima entre ${fmt(min.max, 1)}° e ${fmt(max.max, 1)}°, conforme a direção.`}>
        {[5, 10, 15, 20, 25].map((d) => (
          <g key={d}>
            <circle r={(d / maxRing) * R} fill="none" stroke="currentColor" className="text-border" />
            <text x={(d / maxRing) * R + 2} y={-3} className="fill-current text-[9px] text-muted">
              {d}°
            </text>
          </g>
        ))}
        <line x1={-R} x2={R} y1={0} y2={0} stroke="currentColor" className="text-border" />
        <line y1={-R} y2={R} x1={0} x2={0} stroke="currentColor" className="text-border" />
        <polygon points={pts.join(' ')} fill="rgb(47 158 65 / 0.25)" stroke="#2f9e41" strokeWidth={2} />
        <text x={R + 4} y={4} className="fill-current text-[10px] text-fg">
          +roll
        </text>
        <text x={-12} y={-R - 6} className="fill-current text-[10px] text-fg">
          +pitch
        </text>
      </svg>
      <figcaption className="text-center text-xs text-muted">
        De {fmt(min.max, 1)}° a {fmt(max.max, 1)}°, conforme a direção
      </figcaption>
    </figure>
  );
}

export default function WorkspacePage() {
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const navigate = useNavigate();
  const stage = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(stage);
  const [mode, setMode] = useState<Mode>('posicao');
  const [pose, setPose] = useState<Pose>(() => zeroPose(geometry.home_z));
  const [res, setRes] = useState<keyof typeof RESOLUTION>('rapida');
  const [showSurface, setShowSurface] = useState(true);
  const [showSlice, setShowSlice] = useState(true);
  const [showRig, setShowRig] = useState(true);
  const [sliceZ, setSliceZ] = useState(geometry.home_z);

  const background = useMemo(() => {
    void theme;
    return sceneBackground();
  }, [theme]);

  const orient = mode === 'posicao' ? { roll: pose.roll, pitch: pose.pitch, yaw: pose.yaw } : { roll: 0, pitch: 0, yaw: pose.yaw };
  const field = usePositionField(geometry, orient, RESOLUTION[res]);
  const tilt = useTiltField(geometry, { x: pose.x, y: pose.y, z: pose.z }, pose.yaw, mode === 'inclinacao');
  const reach = useMemo(() => axisReach(geometry, zeroPose(geometry.home_z)), [geometry]);
  // o mesmo alcance sem a margem de segurança (os limites físicos), para comparar
  const physicalReach = useMemo(() => {
    const v = geometry.limits?.values;
    if (!v || !geometry.limits) return null;
    const phys = { ...geometry, limits: { ...geometry.limits, operational: physicalLimits(v) } };
    return axisReach(phys, zeroPose(geometry.home_z));
  }, [geometry]);
  const lim = useLimits();
  const { margin, limit } = useMemo(() => {
    const l = makeLimiter(geometry);
    const m = l.margin(pose.x, pose.y, pose.z, pose.roll, pose.pitch, pose.yaw);
    return { margin: m, limit: l.lastLimit() };
  }, [geometry, pose]);
  const shownPose = mode === 'posicao' ? pose : { ...pose, roll: 0, pitch: 0 };
  const valid = margin >= 0;

  function useLive() {
    const live = useTelemetry.getState().telemetry?.pose_live;
    if (live) setPose(live);
  }

  function openInKinematics() {
    const q = new URLSearchParams(Object.entries(pose).map(([k, v]) => [k, String(Math.round(v * 10) / 10)]));
    navigate(`/cinematica?${q}`);
  }

  const summary = field.data
    ? `Volume alcançável ${fmt(field.data.volume, 2)} litros; Z de ${fmt(field.data.extent.z[0], 0)} a ${fmt(field.data.extent.z[1], 0)} mm.`
    : 'Calculando o volume alcançável.';

  return (
    <div ref={stage} className={stageClass}>
      <div className="absolute inset-0" role="img" aria-label={`Modelo 3D com o volume alcançável pelo centro do tampo. ${summary}`}>
        <Canvas shadows frameloop="demand" dpr={[1, 2]} camera={{ position: [1500, -1750, 1250], up: [0, 0, 1], fov: 32, near: 5, far: 20000 }} gl={{ toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}>
          <WorkspaceScene geometry={geometry} grid={field.data?.grid ?? null} pose={shownPose} valid={valid} showSurface={showSurface} showSlice={showSlice} showRig={showRig} sliceZ={sliceZ} background={background} />
        </Canvas>
      </div>

      <div className={cn(glass, 'absolute left-3 top-3 max-h-[calc(100%-1.5rem)] w-[min(24rem,calc(100%-1.5rem))] space-y-4 overflow-y-auto p-4 sm:left-4 sm:top-4')}>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Espaço de trabalho</h1>
          {fullscreen && <ModeBadge />}
          {field.busy && <Loader2 aria-label="Calculando" className="size-4 animate-spin text-muted motion-reduce:animate-none" />}
        </div>
        <Tabs.Root value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <Tabs.List aria-label="O que explorar" className="flex gap-1 rounded-lg bg-surface-2 p-1">
            <Tabs.Trigger value="posicao" className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary">
              Posição
            </Tabs.Trigger>
            <Tabs.Trigger value="inclinacao" className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary">
              Inclinação
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="posicao" className="mt-3 space-y-3 outline-none">
            <p className="text-sm text-muted">O volume verde é onde o centro do tampo consegue chegar com a orientação escolhida. Mude roll, pitch e yaw para ver o volume encolher.</p>
            <PoseEditor pose={pose} onChange={setPose} limits={WIDE} />
          </Tabs.Content>
          <Tabs.Content value="inclinacao" className="mt-3 space-y-3 outline-none">
            <p className="text-sm text-muted">Quanto o tampo consegue inclinar, em cada direção, parado na posição escolhida.</p>
            <PoseEditor pose={pose} onChange={setPose} limits={WIDE} fields={['x', 'y', 'z', 'yaw']} />
            {tilt.data ? <TiltPolar data={tilt.data.tilt} /> : <p className="text-sm text-muted">Calculando…</p>}
          </Tabs.Content>
        </Tabs.Root>
        <p role="status" className={cn('text-sm font-medium', valid ? 'text-brand-text' : 'text-danger')}>
          {valid ? `Pose alcançável. Limite mais perto: ${LIMIT_LABELS[limit].toLowerCase()}.` : `Pose fora dos limites: ${LIMIT_LABELS[limit].toLowerCase()}.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={useLive}>
            <Crosshair aria-hidden />
            Usar pose da telemetria
          </Button>
          <Button size="sm" variant="secondary" onClick={openInKinematics} disabled={!valid}>
            <ExternalLink aria-hidden />
            Abrir na Cinemática
          </Button>
        </div>
      </div>

      <div className={cn(glass, 'absolute right-3 top-3 max-h-[calc(100%-6rem)] w-[min(22rem,calc(100%-1.5rem))] space-y-4 overflow-y-auto p-4 sm:right-4 sm:top-4')}>
        <div>
          <h2 className="font-semibold">Leituras</h2>
          <p className="text-2xl font-semibold tabular-nums">{field.data ? `${fmt(field.data.volume, 2)} L` : '…'}</p>
          <p className="text-xs text-muted">volume alcançável na orientação atual</p>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">Alcance de cada eixo a partir do home</h3>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="font-medium">Eixo</th>
                <th className="font-medium">Operação</th>
                <th className="font-medium">Sem margem</th>
                <th className="font-medium">Antes</th>
              </tr>
            </thead>
            <tbody>
              {AXES.map(({ key, label, unit }) => {
                const [lo, hi] = reach[key];
                const phys = physicalReach?.[key];
                const [slo, shi] = DEFAULT_LIMITS[key];
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="py-1 font-medium">{label}</td>
                    <td>
                      {fmt(lo, 1)} a {fmt(hi, 1)} {unit}
                    </td>
                    <td className="text-muted">{phys ? `${fmt(phys[0], 1)} a ${fmt(phys[1], 1)}` : '—'}</td>
                    <td className="text-muted">
                      {slo} a {shi}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted">
            Cada eixo sozinho, com os outros no home. “Operação” é o que os sliders e controles usam (com 20% de margem); “sem margem” é o limite físico; “antes” eram as faixas fixas usadas até agora.
          </p>
        </div>
        <div className="space-y-3 border-t border-border pt-3">
          <SwitchField label="Superfície do volume" checked={showSurface} onCheckedChange={setShowSurface} />
          <SwitchField label="Corte horizontal" checked={showSlice} onCheckedChange={setShowSlice} />
          <SwitchField label="Pernas e tampo" description="Desligue para ver só o volume sobre a base." checked={showRig} onCheckedChange={setShowRig} />
          {showSlice && <SliderField label="Altura do corte" value={sliceZ} onValueChange={setSliceZ} min={Math.floor(lim.pose.z[0] - 40)} max={Math.ceil(lim.pose.z[1] + 40)} step={1} unit="mm" unitSpoken="milímetros" digits={0} />}
          <SelectField label="Resolução" value={res} onChange={(e) => setRes(e.target.value as keyof typeof RESOLUTION)}>
            <option value="rapida">Rápida (48³)</option>
            <option value="fina">Fina (96³, mais lenta)</option>
          </SelectField>
        </div>
        <div className="space-y-2 rounded-lg bg-surface-2 p-3 text-xs text-muted">
          <p className="flex gap-2">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Considera os limites reais com 20% de margem: curso do atuador, ângulo dos cardãs da base e do tampo e distância entre as pernas (Ajustes → Limites da
              mecânica). No corte, verde é longe dos limites; perto, a cor mostra qual limite está chegando:
            </span>
          </p>
          <ul className="grid grid-cols-2 gap-1" aria-label="Legenda do corte">
            {LIMIT_LABELS.map((label, i) => (
              <li key={label} className="flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: `rgb(${LIMIT_COLORS[i].join(',')})` }} />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={cn(glass, 'absolute bottom-3 right-3 p-2 sm:bottom-4 sm:right-4')}>
        <Button size="sm" variant="secondary" onClick={toggleFullscreen} aria-pressed={fullscreen}>
          {fullscreen ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
          {fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        </Button>
      </div>
    </div>
  );
}
