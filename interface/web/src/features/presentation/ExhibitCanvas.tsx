import { ContactShadows, MeshReflectorMaterial, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { PoseAxis } from '@/features/recorder/trajectory';
import { PREMIUM_FLOOR_Z } from '@/features/platform3d/premium/PremiumBase';
import { PremiumRig } from '@/features/platform3d/premium/PremiumRig';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import { transformPoints } from '@/lib/kinematics';
import { PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose } from '@/lib/types';
import { shotPosition, type Shot } from './scenes';

const BRAND = '#3fb654';

export interface ExhibitFrame {
  pose: Pose;
  shot: Shot;
  /** pernas acesas: índice de uma, 'all' ou null */
  legs: number | 'all' | null;
  /** eixo em destaque (seta ou anel sobre o tampo) */
  axis: PoseAxis | null;
}

function FrameHook({ onFrame }: { onFrame: (dt: number) => void }) {
  useFrame((_, dt) => onFrame(Math.min(dt, 0.1)));
  return null;
}

/**
 * Leva a câmera até a tomada pedida, com suavização (troca de cena sem corte seco).
 * Em telas largas, desloca a imagem para a direita: o texto fica à esquerda sem cobrir a bancada.
 */
function CameraDirector({ getFrame, instant }: { getFrame: () => ExhibitFrame; instant: boolean }) {
  const target = useRef(new THREE.Vector3(0, 0, 170));
  const goal = useRef(new THREE.Vector3());
  const look = useRef(new THREE.Vector3());
  const first = useRef(true);
  const size = useThree((s) => s.size);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  useEffect(() => {
    const wide = size.width / size.height > 1.25 && size.width >= 900;
    if (wide) camera.setViewOffset(size.width, size.height, -size.width * 0.2, 0, size.width, size.height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  useFrame((_, dt) => {
    const { shot } = getFrame();
    goal.current.set(...shotPosition(shot));
    const k = instant || first.current ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 1.6);
    first.current = false;
    camera.position.lerp(goal.current, k);
    target.current.lerp(look.current.set(0, 0, shot.targetZ), k);
    camera.lookAt(target.current);
  });
  return null;
}

const UP = new THREE.Vector3(0, 1, 0);
// temporários e materiais no módulo: só existe um palco por vez, e o quadro a quadro não aloca
const LEG_MATERIALS = PISTON_COLORS.map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(2.2), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, depthTest: false }));
const TMP = { a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), q: new THREE.Quaternion() };
const GIZMO_MAT = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, transparent: true, opacity: 0.95 });
const GIZMO = { color: new THREE.Color(), q: new THREE.Quaternion(), dir: new THREE.Vector3(), z: new THREE.Vector3(0, 0, 1) };

/** Pernas acesas (cilindros sem tone mapping: o bloom faz o brilho). */
function LegGlow({ geometry, getFrame }: { geometry: PlatformGeometry; getFrame: () => ExhibitFrame }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  useFrame((_, dt) => {
    const { pose, legs } = getFrame();
    const top = transformPoints(pose, geometry.platform_points_local);
    for (let i = 0; i < 6; i++) {
      const m = meshes.current[i];
      if (!m) continue;
      const on = legs === 'all' || legs === i;
      const mat = LEG_MATERIALS[i];
      mat.opacity += ((on ? 0.7 : 0) - mat.opacity) * Math.min(1, dt * 5);
      m.visible = mat.opacity > 0.02;
      if (!m.visible) continue;
      TMP.a.set(...geometry.base_points[i]);
      TMP.b.set(...top[i]);
      TMP.d.subVectors(TMP.b, TMP.a);
      const len = TMP.d.length();
      m.position.addVectors(TMP.a, TMP.b).multiplyScalar(0.5);
      m.quaternion.copy(TMP.q.setFromUnitVectors(UP, TMP.d.normalize()));
      m.scale.set(1, len, 1);
    }
  });
  return (
    <group>
      {LEG_MATERIALS.map((mat, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          material={mat}
          renderOrder={20}
        >
          <cylinderGeometry args={[10, 10, 1, 16, 1, true]} />
        </mesh>
      ))}
    </group>
  );
}

const AXIS_DIR: Record<PoseAxis, [number, number, number]> = {
  x: [1, 0, 0],
  y: [0, 1, 0],
  z: [0, 0, 1],
  roll: [1, 0, 0],
  pitch: [0, 1, 0],
  yaw: [0, 0, 1],
};
const AXIS_COLOR: Record<PoseAxis, string> = { x: '#ff5a5a', y: '#5dff7a', z: '#5aa8ff', roll: '#ff5a5a', pitch: '#5dff7a', yaw: '#5aa8ff' };

/** Seta (translação) ou anel (rotação) sobre o tampo para o eixo em destaque. */
function AxisGizmo({ getFrame }: { getFrame: () => ExhibitFrame }) {
  const arrow = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const mat = GIZMO_MAT;
  useFrame(() => {
    const { pose, axis } = getFrame();
    const rot = axis === 'roll' || axis === 'pitch' || axis === 'yaw';
    if (arrow.current) arrow.current.visible = !!axis && !rot;
    if (ring.current) ring.current.visible = !!axis && rot;
    if (!axis) return;
    GIZMO_MAT.color.copy(GIZMO.color.set(AXIS_COLOR[axis]).multiplyScalar(1.8));
    GIZMO.dir.set(...AXIS_DIR[axis]);
    const g = rot ? ring.current : arrow.current;
    if (!g) return;
    g.position.set(pose.x, pose.y, pose.z + 70);
    // seta: cilindro no +Y local → direção do eixo; anel: toro no plano XY local → normal no eixo
    g.quaternion.copy(GIZMO.q.setFromUnitVectors(rot ? GIZMO.z : UP, GIZMO.dir));
  });
  return (
    <>
      <group ref={arrow} visible={false}>
        <mesh material={mat} position={[0, 0, 0]}>
          <cylinderGeometry args={[6, 6, 300, 16]} />
        </mesh>
        <mesh material={mat} position={[0, 175, 0]}>
          <coneGeometry args={[20, 50, 24]} />
        </mesh>
        <mesh material={mat} position={[0, -175, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[20, 50, 24]} />
        </mesh>
      </group>
      <group ref={ring} visible={false}>
        <mesh material={mat}>
          <torusGeometry args={[230, 6, 12, 96, Math.PI * 1.6]} />
        </mesh>
        <mesh material={mat} position={[230 * Math.cos(Math.PI * 1.6), 230 * Math.sin(Math.PI * 1.6), 0]} rotation={[0, 0, Math.PI * 1.6]}>
          <coneGeometry args={[18, 46, 24]} />
        </mesh>
      </group>
    </>
  );
}

/** Piso escuro com reflexo suave (só no modo de alta qualidade). */
function ReflectiveFloor({ color }: { color: string }) {
  return (
    <group position={[0, 0, PREMIUM_FLOOR_Z]}>
      <mesh position={[0, 0, -1]} receiveShadow>
        <circleGeometry args={[9000, 96]} />
        <MeshReflectorMaterial
          resolution={512}
          blur={[400, 120]}
          mixBlur={1}
          mixStrength={1.6}
          roughness={0.85}
          depthScale={0.6}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.2}
          color={color}
          metalness={0.4}
          mirror={0.4}
        />
      </mesh>
      <ContactShadows rotation={[Math.PI / 2, 0, 0]} scale={2400} far={1000} blur={2.6} opacity={0.7} resolution={1024} />
      {/* halo verde sob a bancada */}
      <mesh position={[0, 0, 1]}>
        <ringGeometry args={[520, 560, 128]} />
        <meshBasicMaterial color={new THREE.Color(BRAND).multiplyScalar(1.6)} toneMapped={false} transparent opacity={0.55} />
      </mesh>
    </group>
  );
}

interface ExhibitCanvasProps {
  /** cores do tema (fundo/névoa e piso) */
  bg: string;
  floor: string;
  dark: boolean;
  geometry: PlatformGeometry;
  getFrame: () => ExhibitFrame;
  onFrame?: (dt: number) => void;
  reducedMotion: boolean;
}

/** Palco da apresentação ao público: câmera dirigida, luzes de recorte, reflexo e brilho. */
export function ExhibitCanvas({ geometry, getFrame, onFrame, reducedMotion, bg, floor, dark }: ExhibitCanvasProps) {
  const [high, setHigh] = useState(true);
  const getPose = () => getFrame().pose;
  return (
    <Canvas
      shadows
      dpr={high ? [1, 2] : [1, 1.25]}
      camera={{ position: [1650, -1900, 1150], up: [0, 0, 1], fov: 30, near: 5, far: 30000 }}
      gl={{ antialias: !high, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.1 }}
    >
      <color attach="background" args={[bg]} />
      <fog attach="fog" args={[bg, 4800, 11000]} />
      <PerformanceMonitor onDecline={() => setHigh(false)} />
      {onFrame && <FrameHook onFrame={onFrame} />}
      <CameraDirector getFrame={getFrame} instant={reducedMotion} />
      <StudioLights high={high} />
      {/* luzes de recorte: verde IFSP atrás e azul frio de lado */}
      <spotLight position={[-1400, 1500, 1500]} angle={0.5} penumbra={0.8} intensity={dark ? 5e6 : 2.5e6} distance={0} decay={2} color={BRAND} />
      <spotLight position={[1800, 1200, 600]} angle={0.45} penumbra={0.9} intensity={dark ? 5e6 : 2.5e6} distance={0} decay={2} color="#6aa8ff" />
      <PremiumRig geometry={geometry} getPose={getPose} />
      <LegGlow geometry={geometry} getFrame={getFrame} />
      <AxisGizmo getFrame={getFrame} />
      {!reducedMotion && <Sparkles count={70} scale={[2600, 2600, 1200]} position={[0, 0, 500]} size={6} speed={0.25} opacity={dark ? 0.5 : 0.35} color={BRAND} />}
      {high ? <ReflectiveFloor color={floor} /> : <StudioStage color={bg} high={false} />}
      {high && (
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={90} intensity={2} distanceFalloff={0.7} halfRes />
          <Bloom luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={reducedMotion || !dark ? 0.4 : 0.9} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <Vignette offset={0.25} darkness={dark ? 0.75 : 0.3} />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
  );
}
