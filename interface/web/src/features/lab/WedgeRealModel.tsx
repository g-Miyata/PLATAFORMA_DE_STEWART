import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { Home } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Canvas } from '@/components/Canvas3D';
import { Button } from '@/components/ui/button';
import { SliderField, SwitchField } from '@/components/ui/field';
import { applyLegFrame } from '@/features/platform3d/legFrame';
import { PM } from '@/features/platform3d/premium/assets';
import { PremiumBase } from '@/features/platform3d/premium/PremiumBase';
import { ACT, ActuatorBody, ActuatorRod, UJoint } from '@/features/platform3d/premium/PremiumParts';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import { Yoke } from '@/features/platform3d/premium/TopJoint';
import { usePlateGeometry } from '@/features/platform3d/TopPlate';
import { cn } from '@/lib/cn';
import { checkPose, REASON_TEXT } from '@/lib/limits';
import { fmt, PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';
import { kitPieces, seatFrames, wedgeMesh, type LabGeometry, type Mesh, type SeatFrame, type WedgeParams } from './wedge';

const DEG = Math.PI / 180;
const V = (v: Vec3) => new THREE.Vector3(v[0], v[1], v[2]);

function poseMatrix(p: Pose) {
  const m = new THREE.Matrix4();
  m.makeRotationFromEuler(new THREE.Euler(p.roll * DEG, p.pitch * DEG, p.yaw * DEG, 'ZYX'));
  m.setPosition(p.x, p.y, p.z);
  return m;
}

/** Base ortonormal com +Y no eixo e +X no pino (ortogonalizado). */
function basisQuat(axis: THREE.Vector3, pin: THREE.Vector3) {
  const y = axis.clone().normalize();
  const x = pin.clone().addScaledVector(y, -pin.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Cardã articulado: garfo de cima no eixo do assento, garfo de baixo na perna. */
function Cardan({ center, up, down, over }: { center: THREE.Vector3; up: THREE.Vector3; down: THREE.Vector3; over: boolean }) {
  const { qUp, qDown, pinA, pinB } = useMemo(() => {
    let a = new THREE.Vector3().crossVectors(up, down);
    if (a.lengthSq() < 1e-8) a = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x);
    a.normalize();
    const b = new THREE.Vector3().crossVectors(a, down).normalize();
    return { qUp: basisQuat(up, a), qDown: basisQuat(down, b), pinA: basisQuat(a, up), pinB: basisQuat(b, down) };
  }, [up, down]);
  return (
    <group position={center}>
      <group quaternion={qUp}>
        <Yoke neck={false} />
      </group>
      <group quaternion={qDown}>
        <Yoke neck />
      </group>
      <mesh material={over ? RED_MAT : PM.darkSteel}>
        <boxGeometry args={[9, 9, 9]} />
      </mesh>
      <mesh material={PM.chrome} quaternion={pinA}>
        <cylinderGeometry args={[3.4, 3.4, 30, 16]} />
      </mesh>
      <mesh material={PM.chrome} quaternion={pinB}>
        <cylinderGeometry args={[3.4, 3.4, 30, 16]} />
      </mesh>
    </group>
  );
}

const RED_MAT = new THREE.MeshStandardMaterial({ color: '#e5484d', emissive: '#e5484d', emissiveIntensity: 0.5 });

function Leg({ index, base, top, bad }: { index: number; base: Vec3; top: THREE.Vector3; bad: boolean }) {
  const { position, quaternion, L } = useMemo(() => {
    const o = new THREE.Object3D();
    const L = applyLegFrame(o, base, [top.x, top.y, top.z]);
    return { position: o.position.clone(), quaternion: o.quaternion.clone(), L };
  }, [base, top]);
  const tube = useMemo(() => {
    const m = PM.aluminum.clone();
    if (bad) {
      m.emissive.set('#b01e23');
      m.emissiveIntensity = 0.6;
    }
    return m;
  }, [bad]);
  return (
    <group position={position} quaternion={quaternion}>
      <UJoint />
      <ActuatorBody index={index} highlighted={false} selected={false} tubeMaterial={tube} />
      <group position={[0, L - ACT.joint - ACT.rodLength / 2, 0]}>
        <ActuatorRod />
      </group>
    </group>
  );
}

function meshGeometry(m: Mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3));
  g.setIndex(m.indices);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

/** Calço, arruela e parafuso de um cardã, no referencial do tampo. */
function SeatStack({ f, p, withWedge, exploded, pieces }: { f: SeatFrame; p: WedgeParams; withWedge: boolean; exploded: boolean; pieces: { wedge: THREE.BufferGeometry; washer: THREE.BufferGeometry } }) {
  const axis = V(f.axis);
  const psi = Math.atan2(f.heading[1], f.heading[0]);
  const lift = (k: number) => axis.clone().multiplyScalar(exploded ? k : 0);
  // parafuso: da rosca dentro do cubo (10 mm) até a cabeça
  const start = V(f.hub).addScaledVector(axis, -10);
  const head = V(withWedge ? f.head : [f.attach[0], f.attach[1], f.attach[2] + p.plateMm]);
  const shank = head.clone().sub(start);
  const len = shank.length();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const headR = (p.screwMm * 1.6) / Math.sqrt(3);
  const screwLift = lift(46);
  return (
    <>
      {withWedge && (
        <>
          <group position={V(f.wedgeOrigin)} rotation={[0, 0, psi]}>
            <mesh geometry={pieces.wedge} material={PM.bluePla} rotation={[Math.PI, 0, 0]} castShadow />
          </group>
          <group position={V(f.washerOrigin).add(lift(24))} rotation={[0, 0, psi + Math.PI]}>
            <mesh geometry={pieces.washer} material={PM.bluePla} castShadow />
          </group>
        </>
      )}
      <group position={start.clone().addScaledVector(shank, 0.5).add(screwLift)} quaternion={q}>
        <mesh material={PM.darkSteel} castShadow>
          <cylinderGeometry args={[p.screwMm / 2, p.screwMm / 2, len, 20]} />
        </mesh>
      </group>
      <group position={head.clone().addScaledVector(axis, p.screwMm * 0.33).add(screwLift)} quaternion={q}>
        <mesh material={PM.darkSteel} castShadow>
          <cylinderGeometry args={[headR, headR, p.screwMm * 0.66, 6]} />
        </mesh>
      </group>
    </>
  );
}

type View = 'bancada' | number;

/** Leva a câmera para a bancada inteira ou para o encaixe de uma perna (mantém a órbita do usuário). */
function Focus({ view, target, outward }: { view: View; target: THREE.Vector3; outward: THREE.Vector3 }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const last = useRef<{ view: View; target: THREE.Vector3 } | null>(null);
  useEffect(() => {
    if (!controls) return;
    const prev = last.current;
    if (!prev || prev.view !== view) {
      // vista nova: posição padrão
      if (view === 'bancada') camera.position.set(1100, -1300, 950);
      else camera.position.copy(target).addScaledVector(outward, 230).add(new THREE.Vector3(0, 0, 70));
    } else {
      // mesma vista, a peça andou: a câmera acompanha
      camera.position.add(target.clone().sub(prev.target));
    }
    controls.target.copy(target);
    controls.update();
    last.current = { view, target: target.clone() };
  }, [camera, controls, view, target, outward]);
  return null;
}

/**
 * Bancada no modelo detalhado com o calço montado: cardã articulado, calço, arruela e
 * parafuso nas posições do plano, para conferir o encaixe. Mesmo cálculo do laboratório.
 */
export function WedgeRealModel({ geometry, params, now, wedge }: { geometry: PlatformGeometry; params: WedgeParams; now: LabGeometry; wedge: LabGeometry }) {
  const [withWedge, setWithWedge] = useState(true);
  const [view, setView] = useState<View>(2);
  const [transparent, setTransparent] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [pose, setPose] = useState({ roll: 0, pitch: 0, yaw: 0, dz: 0 });
  const g = withWedge ? wedge : now;
  const frames = useMemo(() => seatFrames(geometry, withWedge ? params : { ...params, angleDeg: 0, minMm: 0 }), [geometry, params, withWedge]);
  const pieces = useMemo(() => {
    const k = kitPieces(params);
    return { wedge: meshGeometry(wedgeMesh(k.wedge)), washer: meshGeometry(wedgeMesh(k.washer)) };
  }, [params]);
  const { plate } = usePlateGeometry(geometry);
  const plateMat = useMemo(() => {
    const m = PM.powderBlack.clone();
    m.transparent = transparent;
    m.opacity = transparent ? 0.28 : 1;
    m.depthWrite = !transparent;
    return m;
  }, [transparent]);

  const worldPose: Pose = { x: 0, y: 0, z: g.home_z + pose.dz, roll: pose.roll, pitch: pose.pitch, yaw: pose.yaw };
  const check = checkPose(worldPose, g);
  const M = poseMatrix(worldPose);
  const R = new THREE.Matrix3().setFromMatrix4(M);
  const centers = frames.map((f) => V(f.center).applyMatrix4(M));
  const ups = frames.map((f) => V(f.axis).applyMatrix3(R).normalize());
  const topLimit = g.limits?.operational.cardan_top_max_deg ?? 36;
  const i = view === 'bancada' ? null : view;
  const target = i === null ? new THREE.Vector3(0, 0, 330) : centers[i].clone().addScaledVector(ups[i], 22);
  const outward = i === null ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(geometry.platform_points_local[i][0], geometry.platform_points_local[i][1], 0).normalize().multiplyScalar(0.8).add(new THREE.Vector3(0, -0.6, 0)).normalize();
  const reason = check.valid ? null : check.reasons.flat()[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex gap-1" role="group" aria-label="Montagem">
          <Button size="sm" variant={!withWedge ? 'primary' : 'ghost'} aria-pressed={!withWedge} onClick={() => setWithWedge(false)}>
            Hoje
          </Button>
          <Button size="sm" variant={withWedge ? 'primary' : 'ghost'} aria-pressed={withWedge} onClick={() => setWithWedge(true)}>
            Com calço de {fmt(params.angleDeg, 0)}°
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 sm:ml-auto" role="group" aria-label="Vista">
          <Button size="sm" variant={view === 'bancada' ? 'primary' : 'ghost'} aria-pressed={view === 'bancada'} onClick={() => setView('bancada')}>
            Bancada inteira
          </Button>
          {PISTON_COLORS.map((c, k) => (
            <Button key={k} size="sm" variant={view === k ? 'primary' : 'ghost'} aria-pressed={view === k} onClick={() => setView(k)} aria-label={`Encaixe do cardã da perna ${k + 1}`}>
              <span className="size-2 rounded-full" style={{ background: c }} aria-hidden />P{k + 1}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative h-[30rem] overflow-hidden rounded-xl border border-border" aria-hidden>
        <Canvas shadows frameloop="demand" dpr={[1, 1.75]} camera={{ position: [0, -300, 800], up: [0, 0, 1], fov: 34, near: 2, far: 20000 }} gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}>
          <color attach="background" args={['#1a1f26']} />
          <StudioLights high={false} />
          <PremiumBase geometry={geometry} />
          {centers.map((c, k) => (
            <Leg key={k} index={k} base={geometry.base_points[k]} top={c} bad={check.reasons[k].length > 0} />
          ))}
          {centers.map((c, k) => (
            <Cardan key={`c${k}`} center={c} up={ups[k]} down={V(geometry.base_points[k]).sub(c).normalize()} over={check.topDeg[k] > topLimit} />
          ))}
          <group position={[worldPose.x, worldPose.y, worldPose.z]} rotation={new THREE.Euler(worldPose.roll * DEG, worldPose.pitch * DEG, worldPose.yaw * DEG, 'ZYX')}>
            <mesh geometry={plate} material={plateMat} position={[0, 0, frames[0].attach[2]]} scale={[1, 1, params.plateMm / 8]} castShadow={!transparent} receiveShadow />
            {frames.map((f, k) => (
              <SeatStack key={k} f={f} p={params} withWedge={withWedge} exploded={exploded && withWedge} pieces={pieces} />
            ))}
          </group>
          <StudioStage color="#1a1f26" high={false} frames={1} />
          <OrbitControls makeDefault enableDamping={false} />
          <Focus view={view} target={target} outward={outward} />
        </Canvas>
        <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-1.5rem)] space-y-1 rounded-lg bg-surface/85 px-3 py-2 text-sm backdrop-blur">
          <p className="font-semibold">
            {withWedge ? `Com calço de ${fmt(params.angleDeg, 0)}°` : 'Hoje (sem calço)'} ·{' '}
            {reason ? <span className="text-danger">pose recusada: {REASON_TEXT[reason]}</span> : <span className="text-brand-text">pose aceita</span>}
          </p>
          {i !== null && (
            <p className="tabular-nums text-muted">
              P{i + 1}: cardã do tampo <span className={cn('font-semibold', check.topDeg[i] > topLimit ? 'text-danger' : 'text-fg')}>{fmt(check.topDeg[i], 1)}°</span> (limite {fmt(topLimit, 0)}°) · da base {fmt(check.base[i], 1)}° · perna{' '}
              {fmt(check.lengths[i], 0)} mm
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <div className="grid gap-3 sm:grid-cols-2">
          <SliderField label="Roll" value={pose.roll} onValueChange={(v) => setPose((s) => ({ ...s, roll: v }))} min={-30} max={30} step={0.5} unit="°" unitSpoken="graus" />
          <SliderField label="Pitch" value={pose.pitch} onValueChange={(v) => setPose((s) => ({ ...s, pitch: v }))} min={-30} max={30} step={0.5} unit="°" unitSpoken="graus" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SliderField label="Yaw" value={pose.yaw} onValueChange={(v) => setPose((s) => ({ ...s, yaw: v }))} min={-40} max={40} step={1} unit="°" unitSpoken="graus" digits={0} />
          <SliderField label="Z (a partir do home)" value={pose.dz} onValueChange={(v) => setPose((s) => ({ ...s, dz: v }))} min={-120} max={120} step={1} unit="mm" unitSpoken="milímetros" digits={0} />
        </div>
        <div className="flex flex-col gap-2">
          <SwitchField label="Tampo transparente" checked={transparent} onCheckedChange={setTransparent} />
          <SwitchField label="Vista explodida" checked={exploded} onCheckedChange={setExploded} disabled={!withWedge} />
          <Button size="sm" variant="ghost" onClick={() => setPose({ roll: 0, pitch: 0, yaw: 0, dz: 0 })}>
            <Home aria-hidden />
            Home
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">
        Peças azuis: calço (embaixo do tampo) e arruela inclinada (em cima), impressos. Parafuso em cinza escuro, cardã cromado com o garfo de cima no eixo do assento. O cubo da cruzeta fica vermelho quando o cardã do tampo passa do
        limite. A mesma pose vale para as duas montagens (cada uma a partir do próprio home).
      </p>
    </div>
  );
}
