import { Html, Line } from '@react-three/drei';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { PREMIUM_FLOOR_Z } from '@/features/platform3d/premium/PremiumBase';
import { AXIS_COLORS } from '@/features/recorder/TimelinePlot';
import { cn } from '@/lib/cn';
import { PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';
import { legVectors, plateAxes, translation } from './lessonMath';
import { useLessonScene } from './lessonStore';
import type { Overlays as OverlayFlags } from './types';

export const P_COLOR = '#f5b400';
export const RB_COLOR = '#b55cf2';
const INVALID = '#e5484d';

export function Label({ at, children, color, strong }: { at: Vec3; children: ReactNode; color?: string; strong?: boolean }) {
  // O primeiro <Html> da cena monta antes de o canvas ligar os eventos: o drei cria uma
  // segunda raiz no mesmo elemento e a desmontagem da primeira apaga o conteúdo (era o
  // "Base fixa" da 1.1, que ficava vazio). Remontar uma vez, já com o canvas ligado, resolve.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <Html key={ready ? 'pronto' : 'montando'} position={at} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <span
        className={cn(
          'whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-semibold shadow transition-all',
          strong ? 'scale-125 border-brand bg-primary text-on-primary' : 'border-border bg-surface/90 text-fg',
        )}
        style={color && !strong ? { borderColor: color } : undefined}
      >
        {children}
      </span>
    </Html>
  );
}

const noDepth = (color: string, opacity = 0.95) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity });

/** Seta desenhada por cima do modelo (sem teste de profundidade), com ponta em cone. */
export function Arrow({ from, to, color, label, width = 3 }: { from: Vec3; to: Vec3; color: string; label?: ReactNode; width?: number }) {
  const mat = useMemo(() => noDepth(color), [color]);
  const geo = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    const head = Math.min(18, len * 0.3);
    const unit = len > 0 ? dir.clone().divideScalar(len) : new THREE.Vector3(0, 0, 1);
    return {
      len,
      head,
      tip: b.clone().sub(unit.clone().multiplyScalar(head / 2)),
      quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit),
    };
  }, [from, to]);
  if (geo.len < 1e-6) return null;
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  return (
    <group>
      <Line points={[from, to]} color={color} lineWidth={width} depthTest={false} renderOrder={10} />
      <mesh position={geo.tip} quaternion={geo.quat} material={mat} renderOrder={11}>
        <coneGeometry args={[geo.head * 0.38, geo.head, 16]} />
      </mesh>
      {label && (
        <Label at={mid} color={color}>
          {label}
        </Label>
      )}
    </group>
  );
}

export function Dot({ at, color, label, size = 9 }: { at: Vec3; color: string; label?: ReactNode; size?: number }) {
  const mat = useMemo(() => noDepth(color), [color]);
  return (
    <group>
      <mesh position={at} material={mat} renderOrder={12}>
        <sphereGeometry args={[size, 20, 14]} />
      </mesh>
      {label && <Label at={[at[0], at[1], at[2] + 26]}>{label}</Label>}
    </group>
  );
}

const AXIS_NAMES = ['x', 'y', 'z'] as const;

export function Frame({ origin, axes, size = 140, name }: { origin: Vec3; axes: [Vec3, Vec3, Vec3]; size?: number; name?: string }) {
  return (
    <group>
      {axes.map((a, i) => (
        <Arrow
          key={i}
          from={origin}
          to={[origin[0] + a[0] * size, origin[1] + a[1] * size, origin[2] + a[2] * size]}
          color={AXIS_COLORS[AXIS_NAMES[i]]}
          label={size >= 100 ? AXIS_NAMES[i].toUpperCase() : undefined}
          width={2.5}
        />
      ))}
      {name && <Label at={[origin[0] - 30, origin[1] - 30, origin[2] - 25]}>{name}</Label>}
    </group>
  );
}

/** Tampo fantasma: contorno das juntas Pᵢ e as seis pernas finas. */
function GhostPlate({ pose, geometry, color, label }: { pose: Pose; geometry: PlatformGeometry; color: string; label?: string }) {
  const legs = useMemo(() => legVectors(pose, geometry), [pose, geometry]);
  const ring = useMemo(() => [...legs.map((l) => l.P), legs[0].P], [legs]);
  return (
    <group>
      <Line points={ring} color={color} lineWidth={3} transparent opacity={0.85} depthTest={false} renderOrder={8} />
      {legs.map((l, i) => (
        <Line key={i} points={[l.a, l.P]} color={color} lineWidth={1.5} transparent opacity={0.45} depthTest={false} renderOrder={8} />
      ))}
      {label && <Label at={[pose.x, pose.y, pose.z + 50]} color={color}>{label}</Label>}
    </group>
  );
}

/** Esfera de raio Lᵢ em torno de aᵢ: onde a junta do tampo pode estar. */
function ConstraintSphere({ center, radius, color }: { center: Vec3; radius: number; color: string }) {
  const fill = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide }), [color]);
  const wire = useMemo(() => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false }), [color]);
  return (
    <group position={center} scale={radius}>
      <mesh material={fill} renderOrder={6}>
        <sphereGeometry args={[1, 48, 24]} />
      </mesh>
      <mesh material={wire} renderOrder={7}>
        <sphereGeometry args={[1, 24, 12]} />
      </mesh>
    </group>
  );
}

const fmtLen = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm`;
const ORIGIN: Vec3 = [0, 0, 0];
const I3: [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export const PARTS = [
  { id: 'base', label: 'Base fixa' },
  { id: 'tampo', label: 'Plataforma móvel (tampo)' },
  { id: 'atuador', label: 'Atuador linear' },
  { id: 'cardan', label: 'Junta cardã' },
  { id: 'eletronica', label: 'Eletrônica (bandeja)' },
] as const;

/** Vetores, pontos e fantasmas da etapa atual, desenhados sobre a bancada. */
export function LessonOverlays({ geometry, flags }: { geometry: PlatformGeometry; flags: OverlayFlags }) {
  const pose = useLessonScene((s) => s.pose);
  const leg = useLessonScene((s) => s.leg);
  const ghosts = useLessonScene((s) => s.ghosts);
  const sphereLeg = useLessonScene((s) => s.sphereLeg);
  const litLegs = useLessonScene((s) => s.litLegs);
  const focus = useLessonScene((s) => s.focus);
  const measured = useLessonScene((s) => s.measured);
  const legs = useMemo(() => legVectors(pose, geometry), [pose, geometry]);
  const p = useMemo(() => translation(pose), [pose]);
  const axes = useMemo(() => plateAxes(pose), [pose]);
  const one = legs[leg];

  const partAt: Record<string, Vec3> = {
    base: [0, -320, -30],
    tampo: [p[0], p[1], p[2] + 40],
    atuador: [(legs[0].a[0] + legs[0].P[0]) / 2, (legs[0].a[1] + legs[0].P[1]) / 2, (legs[0].a[2] + legs[0].P[2]) / 2],
    cardan: [legs[2].a[0], legs[2].a[1], legs[2].a[2] + 10],
    eletronica: [0, -120, PREMIUM_FLOOR_Z + 90],
  };

  return (
    <group>
      {flags.baseFrame && <Frame origin={ORIGIN} axes={I3} size={160} name="{B}" />}
      {flags.plateFrame && <Frame origin={p} axes={axes} name="{P}" />}
      {flags.translation && <Arrow from={ORIGIN} to={p} color={P_COLOR} label="p" width={4} />}
      {flags.base && legs.map((l, i) => <Dot key={i} at={l.a} color="#dfe3e6" label={`a${i + 1}`} />)}
      {flags.plate && legs.map((l, i) => <Dot key={i} at={l.P} color="#2f9e41" label={flags.plate === 'b' ? `b${i + 1}` : `P${i + 1}`} />)}
      {flags.legs === 'all' &&
        legs.map((l, i) =>
          litLegs && !litLegs.includes(i) ? null : (
            <Arrow key={i} from={l.a} to={l.P} color={l.inStroke ? PISTON_COLORS[i] : INVALID} label={`L${i + 1} = ${fmtLen(l.length)}`} width={litLegs ? 5 : 3} />
          ),
        )}
      {flags.legs === 'one' && one && (
        <>
          {flags.decomposition && (
            <>
              <Arrow from={ORIGIN} to={p} color={P_COLOR} label="p" width={4} />
              <Arrow from={p} to={one.P} color={RB_COLOR} label={`R·b${leg + 1}`} width={4} />
              <Arrow from={ORIGIN} to={one.a} color="#9aa3ab" label={`a${leg + 1}`} width={2} />
            </>
          )}
          <Arrow from={one.a} to={one.P} color={one.inStroke ? PISTON_COLORS[leg] : INVALID} label={`L${leg + 1} = ${fmtLen(one.length)}`} width={5} />
        </>
      )}
      {flags.sphere && sphereLeg !== null && (
        <>
          <ConstraintSphere center={legs[sphereLeg].a} radius={measured?.[sphereLeg] ?? legs[sphereLeg].length} color={PISTON_COLORS[sphereLeg]} />
          <Dot at={legs[sphereLeg].P} color={PISTON_COLORS[sphereLeg]} label={`P${sphereLeg + 1}`} size={12} />
        </>
      )}
      {flags.ghosts && ghosts.map((g, i) => <GhostPlate key={i} pose={g.pose} geometry={geometry} color={g.color} label={g.label} />)}
      {flags.parts &&
        PARTS.map((part) => (
          <group key={part.id}>
            <Dot at={partAt[part.id]} color={focus === part.id ? '#3fb654' : '#dfe3e6'} size={focus === part.id ? 16 : 8} />
            <Label at={[partAt[part.id][0], partAt[part.id][1], partAt[part.id][2] + 34]} strong={focus === part.id}>
              {part.label}
            </Label>
          </group>
        ))}
    </group>
  );
}
