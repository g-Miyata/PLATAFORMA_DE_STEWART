import { OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { Button } from '@/components/ui/button';
import { checkPose } from '@/lib/limits';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { Pose, Vec3 } from '@/lib/types';
import { tiltAt, tiltTable, type Envelope, type LabGeometry } from './wedge';

type Mode = 'circulo' | 'roll' | 'pitch' | 'yaw' | 'z';
const MODES: { id: Mode; label: string }[] = [
  { id: 'circulo', label: 'Inclinação em círculo' },
  { id: 'roll', label: 'Roll' },
  { id: 'pitch', label: 'Pitch' },
  { id: 'yaw', label: 'Yaw' },
  { id: 'z', label: 'Altura (Z)' },
];
const PERIOD = { circulo: 12, roll: 6, pitch: 6, yaw: 7, z: 6 } as const;
const OFFSET = 470;
const RED = new THREE.Color('#e5484d');

interface Frame {
  pose: Pose;
  /** valor mostrado (° ou mm) */
  value: number;
  /** pernas que travam (no limite) */
  limiting: boolean[];
}

/** Pose de um instante da demonstração: o mesmo comando, cada montagem até o próprio limite. */
function demoFrame(mode: Mode, t: number, g: LabGeometry, table: number[], env: Envelope): Frame {
  const home: Pose = { x: 0, y: 0, z: g.home_z, roll: 0, pitch: 0, yaw: 0 };
  let pose: Pose;
  let value: number;
  let clamped: boolean;
  let beyond: Pose;
  if (mode === 'circulo') {
    // sempre no limite: a borda do cone de inclinação, girando
    const phi = (2 * Math.PI * t) / PERIOD.circulo;
    value = tiltAt(table, phi);
    pose = { ...home, roll: value * Math.cos(phi), pitch: value * Math.sin(phi) };
    beyond = { ...home, roll: (value + 0.4) * Math.cos(phi), pitch: (value + 0.4) * Math.sin(phi) };
    clamped = true;
  } else {
    const s = Math.sin((2 * Math.PI * t) / PERIOD[mode]);
    const demand = s * (mode === 'z' ? 200 : 60);
    const [lo, hi] = env.reach[mode];
    value = Math.max(lo, Math.min(hi, demand));
    clamped = demand > hi || demand < lo;
    const k = mode === 'z' ? 'z' : mode;
    const at = (v: number): Pose => (k === 'z' ? { ...home, z: home.z + v } : { ...home, [k]: v });
    pose = at(value);
    beyond = at(value + Math.sign(value) * (mode === 'z' ? 1 : 0.4));
  }
  const limiting = clamped ? checkPose(beyond, g).reasons.map((r) => r.length > 0) : [false, false, false, false, false, false];
  return { pose, value, limiting };
}

const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

function hexShape(points: readonly Vec3[], grow = 0) {
  const pts = [...points].map((p) => [p[0], p[1]] as [number, number]).sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => {
    const r = Math.hypot(x, y) || 1;
    const X = x * (1 + grow / r);
    const Y = y * (1 + grow / r);
    if (i === 0) s.moveTo(X, Y);
    else s.lineTo(X, Y);
  });
  s.closePath();
  return s;
}

/** Aponta um cilindro (altura 1, eixo Y) de `a` até `b`. */
function stretch(o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  _v.subVectors(b, a);
  const len = _v.length();
  o.position.copy(a).addScaledVector(_v, 0.5);
  o.quaternion.setFromUnitVectors(_up, _v.normalize());
  o.scale.set(1, len, 1);
}

interface RigProps {
  g: LabGeometry;
  /** ponto de fixação no tampo de cada cardã (referencial do tampo) */
  attach: Vec3[];
  offsetX: number;
  seatColor: string;
  frame: React.RefObject<Frame | null>;
}

function Rig({ g, attach, offsetX, seatColor, frame }: RigProps) {
  const top = useRef<THREE.Group>(null);
  const legs = useRef<(THREE.Mesh | null)[]>([]);
  const seats = useRef<(THREE.Mesh | null)[]>([]);
  const legMats = useMemo(() => PISTON_COLORS.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.3 })), []);
  const plateTop = useMemo(() => new THREE.ExtrudeGeometry(hexShape(attach, 40), { depth: 8, bevelEnabled: false }), [attach]);
  const plateBase = useMemo(() => new THREE.ExtrudeGeometry(hexShape(g.base_points, 45), { depth: 14, bevelEnabled: false }), [g.base_points]);
  const plateZ = attach[0][2];

  useFrame(() => {
    const f = frame.current;
    if (!f || !top.current) return;
    const { pose } = f;
    top.current.position.set(offsetX + pose.x, pose.y, pose.z);
    // ordem ZYX (yaw, pitch, roll), igual à cinemática
    top.current.rotation.set((pose.roll * Math.PI) / 180, (pose.pitch * Math.PI) / 180, (pose.yaw * Math.PI) / 180, 'ZYX');
    top.current.updateMatrixWorld();
    _m.copy(top.current.matrixWorld);
    g.platform_points_local.forEach((p, i) => {
      _a.set(g.base_points[i][0] + offsetX, g.base_points[i][1], g.base_points[i][2]);
      _b.set(p[0], p[1], p[2]).applyMatrix4(_m);
      const leg = legs.current[i];
      if (leg) stretch(leg, _a, _b);
      const seat = seats.current[i];
      if (seat) {
        // do ponto de fixação no tampo até o centro da cruzeta (o calço inclina este trecho)
        _a.set(attach[i][0], attach[i][1], attach[i][2]).applyMatrix4(_m);
        stretch(seat, _a, _b);
      }
      legMats[i].color.set(f.limiting[i] ? RED : PISTON_COLORS[i]);
      legMats[i].emissive.set(f.limiting[i] ? RED : '#000000');
      legMats[i].emissiveIntensity = f.limiting[i] ? 0.35 : 0;
    });
  });

  return (
    <>
      <mesh geometry={plateBase} position={[offsetX, 0, -14]} receiveShadow>
        <meshStandardMaterial color="#3b4350" roughness={0.8} />
      </mesh>
      {PISTON_COLORS.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            legs.current[i] = m;
          }}
          material={legMats[i]}
          castShadow
        >
          <cylinderGeometry args={[15, 15, 1, 16]} />
        </mesh>
      ))}
      {PISTON_COLORS.map((_, i) => (
        <mesh
          key={`s${i}`}
          ref={(m) => {
            seats.current[i] = m;
          }}
        >
          <cylinderGeometry args={[11, 11, 1, 16]} />
          <meshStandardMaterial color={seatColor} roughness={0.4} metalness={0.4} />
        </mesh>
      ))}
      <group ref={top}>
        <mesh geometry={plateTop} position={[0, 0, plateZ]} castShadow>
          <meshStandardMaterial color="#24303d" roughness={0.6} transparent opacity={0.92} />
        </mesh>
      </group>
    </>
  );
}

/** Máxima inclinação em cada direção: hoje × com calço (gráfico polar). */
function TiltPolar({ now, wedge, phi }: { now: number[]; wedge: number[]; phi: number | null }) {
  const R = 92;
  const max = Math.max(25, Math.ceil(Math.max(...wedge) / 5) * 5);
  const path = (t: number[]) =>
    t
      .map((v, k) => {
        const a = (2 * Math.PI * k) / t.length;
        const r = (v / max) * R;
        return `${k ? 'L' : 'M'}${(r * Math.cos(a)).toFixed(1)},${(-r * Math.sin(a)).toFixed(1)}`;
      })
      .join(' ') + 'Z';
  const minNow = Math.min(...now);
  const minW = Math.min(...wedge);
  return (
    <figure className="space-y-1">
      <svg
        viewBox="-120 -120 240 240"
        className="mx-auto size-56"
        role="img"
        aria-label={`Inclinação máxima por direção. Hoje: de ${fmt(minNow, 1)} a ${fmt(Math.max(...now), 1)} graus. Com calço: de ${fmt(minW, 1)} a ${fmt(Math.max(...wedge), 1)} graus.`}
      >
        {[10, 20, 30].filter((d) => d <= max).map((d) => (
          <g key={d}>
            <circle r={(d / max) * R} fill="none" stroke="var(--c-border)" strokeDasharray="3 3" />
            <text x={(d / max) * R + 2} y={-3} fontSize="9" fill="var(--c-text-muted)">
              {d}°
            </text>
          </g>
        ))}
        <line x1={-R - 6} x2={R + 6} y1={0} y2={0} stroke="var(--c-border)" />
        <line y1={-R - 6} y2={R + 6} x1={0} x2={0} stroke="var(--c-border)" />
        <text x={R + 4} y={12} fontSize="9" fill="var(--c-text-muted)">
          roll +
        </text>
        <text x={4} y={-R - 2} fontSize="9" fill="var(--c-text-muted)">
          pitch +
        </text>
        <path d={path(wedge)} fill="var(--c-brand)" fillOpacity="0.18" stroke="var(--c-brand)" strokeWidth="2" />
        <path d={path(now)} fill="#e5a000" fillOpacity="0.14" stroke="#e5a000" strokeWidth="2" />
        {phi !== null && <line x1={0} y1={0} x2={(R + 4) * Math.cos(phi)} y2={-(R + 4) * Math.sin(phi)} stroke="var(--c-text)" strokeWidth="1" opacity="0.5" />}
      </svg>
      <figcaption className="flex justify-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: '#e5a000' }} aria-hidden />
          Hoje
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm bg-brand" aria-hidden />
          Com calço
        </span>
      </figcaption>
    </figure>
  );
}

const reduceMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * As duas montagens lado a lado recebendo o mesmo comando: cada uma vai até o próprio
 * limite (as pernas que travam ficam vermelhas). Mostra o alcance a mais do calço.
 */
export function WedgeDemo({ now, wedge, envNow, envWedge, angleDeg, jointMm }: { now: LabGeometry; wedge: LabGeometry; envNow: Envelope; envWedge: Envelope; angleDeg: number; jointMm: number }) {
  const [mode, setMode] = useState<Mode>('circulo');
  const [playing, setPlaying] = useState(() => !reduceMotion());
  const tables = useMemo(() => ({ now: tiltTable(now), wedge: tiltTable(wedge) }), [now, wedge]);
  // fixação dos cardãs no tampo (a montagem de hoje: centro da cruzeta jointMm abaixo)
  const attach = useMemo<Vec3[]>(() => now.platform_points_local.map((p) => [p[0], p[1], p[2] + jointMm]), [now, jointMm]);
  const frameNow = useRef<Frame | null>(null);
  const frameWedge = useRef<Frame | null>(null);
  const clock = useRef(0);
  const [readout, setReadout] = useState<{ now: number; wedge: number; phi: number | null }>({ now: 0, wedge: 0, phi: null });

  const step = (dt: number) => {
    if (playing) clock.current += dt;
    const t = clock.current;
    frameNow.current = demoFrame(mode, t, now, tables.now, envNow);
    frameWedge.current = demoFrame(mode, t, wedge, tables.wedge, envWedge);
  };

  useEffect(() => {
    const id = setInterval(() => {
      const a = frameNow.current;
      const b = frameWedge.current;
      if (a && b) setReadout({ now: a.value, wedge: b.value, phi: mode === 'circulo' ? (2 * Math.PI * clock.current) / PERIOD.circulo : null });
    }, 150);
    return () => clearInterval(id);
  }, [mode]);

  const unit = mode === 'z' ? ' mm' : '°';
  const gain = mode === 'circulo' ? readout.wedge - readout.now : Math.abs(readout.wedge) - Math.abs(readout.now);
  const reachText = (e: Envelope) =>
    mode === 'circulo' ? `mín. ±${fmt(e.tilt, 1)}° em qualquer direção` : `${fmt(e.reach[mode][0], mode === 'z' ? 0 : 1)} a ${fmt(e.reach[mode][1], mode === 'z' ? 0 : 1)}${unit}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Movimento da demonstração">
        {MODES.map((m) => (
          <Button key={m.id} size="sm" variant={mode === m.id ? 'primary' : 'ghost'} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </Button>
        ))}
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar a demonstração' : 'Continuar a demonstração'}>
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
          {playing ? 'Pausar' : 'Continuar'}
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_16rem]">
        <div className="relative h-[26rem] overflow-hidden rounded-xl border border-border bg-surface-2" aria-hidden>
          <Canvas shadows dpr={[1, 1.75]} camera={{ position: [0, -2050, 1000], up: [0, 0, 1], fov: 34, near: 5, far: 20000 }}>
            <color attach="background" args={['#161b22']} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[800, -1400, 2200]} intensity={2.4} castShadow shadow-mapSize={[1024, 1024]} />
            <directionalLight position={[-1200, 900, 800]} intensity={0.6} />
            <Driver step={step} />
            <Rig g={now} attach={attach} offsetX={-OFFSET} seatColor="#b8bec8" frame={frameNow} />
            <Rig g={wedge} attach={attach} offsetX={OFFSET} seatColor="#2f6fd6" frame={frameWedge} />
            <mesh position={[0, 0, -15]} receiveShadow>
              <planeGeometry args={[4000, 2400]} />
              <meshStandardMaterial color="#1c222b" roughness={0.95} />
            </mesh>
            <OrbitControls makeDefault target={[0, 0, 330]} enablePan={false} />
          </Canvas>
          <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-between gap-2 text-sm">
            <div className="rounded-lg bg-surface/85 px-3 py-2 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Hoje (sem calço)</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: '#e5a000' }}>
                {fmt(readout.now, mode === 'z' ? 0 : 1)}
                {unit}
              </p>
              <p className="text-xs text-muted">{reachText(envNow)}</p>
            </div>
            <div className="rounded-lg bg-surface/85 px-3 py-2 text-right backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Com calço de {fmt(angleDeg, 0)}°</p>
              <p className="text-2xl font-bold tabular-nums text-brand-text">
                {fmt(readout.wedge, mode === 'z' ? 0 : 1)}
                {unit}
              </p>
              <p className="text-xs text-muted">{reachText(envWedge)}</p>
            </div>
          </div>
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-surface/85 px-3 py-1 text-sm font-semibold tabular-nums backdrop-blur">
            {gain >= 0.05 ? `+${fmt(gain, mode === 'z' ? 0 : 1)}${unit} com o calço` : 'mesmo alcance agora'}
          </p>
        </div>
        <div className="space-y-3">
          <TiltPolar now={tables.now} wedge={tables.wedge} phi={readout.phi} />
          <p className="text-xs text-muted">
            O mesmo comando vai para as duas; cada uma para no próprio limite. Pernas em <span className="font-semibold text-danger">vermelho</span> são as que travam. Os tocos azuis são os calços (o assento inclinado de
            cada cardã do tampo).
          </p>
        </div>
      </div>
      <p className="sr-only" aria-live="off">
        Hoje: {fmt(readout.now, 1)}
        {unit}. Com calço: {fmt(readout.wedge, 1)}
        {unit}.
      </p>
    </div>
  );
}

/** Avança a demonstração a cada quadro (dentro do Canvas). */
function Driver({ step }: { step: (dt: number) => void }) {
  useFrame((_, dt) => step(Math.min(dt, 0.1)));
  return null;
}
