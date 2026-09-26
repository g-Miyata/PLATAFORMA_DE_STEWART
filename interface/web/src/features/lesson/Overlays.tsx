import { Html, Line } from '@react-three/drei';
import { useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { AXIS_COLORS } from '@/features/recorder/TimelinePlot';
import { PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';
import { legVectors, plateAxes, translation } from './lessonMath';
import type { Overlays as OverlayFlags } from './steps';

const T_COLOR = '#f5b400';
const RP_COLOR = '#b55cf2';
const INVALID = '#e5484d';

function Label({ at, children, color }: { at: Vec3; children: ReactNode; color?: string }) {
  return (
    <Html position={at} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <span
        className="whitespace-nowrap rounded-md border border-border bg-surface/90 px-1.5 py-0.5 text-xs font-semibold text-fg shadow"
        style={color ? { borderColor: color } : undefined}
      >
        {children}
      </span>
    </Html>
  );
}

const noDepth = (color: string) => new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 });

/** Seta desenhada por cima do modelo (sem teste de profundidade), com ponta em cone. */
function Arrow({ from, to, color, label, width = 3 }: { from: Vec3; to: Vec3; color: string; label?: ReactNode; width?: number }) {
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

function Dot({ at, color, label }: { at: Vec3; color: string; label?: ReactNode }) {
  const mat = useMemo(() => noDepth(color), [color]);
  return (
    <group>
      <mesh position={at} material={mat} renderOrder={12}>
        <sphereGeometry args={[9, 20, 14]} />
      </mesh>
      {label && <Label at={[at[0], at[1], at[2] + 26]}>{label}</Label>}
    </group>
  );
}

const AXIS_NAMES = ['x', 'y', 'z'] as const;

function Frame({ origin, axes, size = 140 }: { origin: Vec3; axes: [Vec3, Vec3, Vec3]; size?: number }) {
  return (
    <group>
      {axes.map((a, i) => (
        <Arrow
          key={i}
          from={origin}
          to={[origin[0] + a[0] * size, origin[1] + a[1] * size, origin[2] + a[2] * size]}
          color={AXIS_COLORS[AXIS_NAMES[i]]}
          label={AXIS_NAMES[i].toUpperCase()}
        />
      ))}
    </group>
  );
}

const fmtLen = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm`;
const ORIGIN: Vec3 = [0, 0, 0];

/** Vetores e pontos da etapa atual da aula, desenhados sobre a bancada. */
export function LessonOverlays({ pose, geometry, flags, leg }: { pose: Pose; geometry: PlatformGeometry; flags: OverlayFlags; leg: number }) {
  const legs = useMemo(() => legVectors(pose, geometry), [pose, geometry]);
  const T = useMemo(() => translation(pose), [pose]);
  const axes = useMemo(() => plateAxes(pose), [pose]);
  const one = legs[leg];
  return (
    <group>
      {flags.plateFrame && <Frame origin={T} axes={axes} />}
      {flags.translation && <Arrow from={ORIGIN} to={T} color={T_COLOR} label="T" width={4} />}
      {flags.base && legs.map((l, i) => <Dot key={i} at={l.b} color="#dfe3e6" label={`b${i + 1}`} />)}
      {flags.plate && legs.map((l, i) => <Dot key={i} at={l.P} color="#2f9e41" label={`p${i + 1}`} />)}
      {flags.legs === 'all' &&
        legs.map((l, i) => <Arrow key={i} from={l.b} to={l.P} color={l.inStroke ? PISTON_COLORS[i] : INVALID} label={`L${i + 1} = ${fmtLen(l.length)}`} />)}
      {flags.legs === 'one' && one && (
        <>
          {flags.decomposition && (
            <>
              <Arrow from={ORIGIN} to={T} color={T_COLOR} label="T" width={4} />
              <Arrow from={T} to={one.P} color={RP_COLOR} label={`R·p${leg + 1}`} width={4} />
              <Arrow from={ORIGIN} to={one.b} color="#9aa3ab" label={`b${leg + 1}`} width={2} />
            </>
          )}
          <Arrow from={one.b} to={one.P} color={one.inStroke ? PISTON_COLORS[leg] : INVALID} label={`L${leg + 1} = ${fmtLen(one.length)}`} width={5} />
        </>
      )}
    </group>
  );
}
