import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { showcasePose } from '@/features/landing/showcase';
import { PremiumRig } from '@/features/platform3d/premium/PremiumRig';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import type { PlatformGeometry, Pose, Vec3 } from '@/lib/types';
import { useLessonScene } from './lessonStore';
import { LessonOverlays } from './Overlays';
import { UR_BASE, UR5eScene } from './serial/UR5eArm';
import type { CameraPreset, SceneSpec } from './types';

interface Shot {
  position: Vec3;
  target: Vec3;
}

function cameraShot(preset: CameraPreset, geometry: PlatformGeometry): Shot {
  const a1 = geometry.base_points[0];
  const out = new THREE.Vector3(a1[0], a1[1], 0).normalize();
  const side = new THREE.Vector3(-out.y, out.x, 0);
  switch (preset) {
    case 'joint':
      return {
        target: [a1[0], a1[1], a1[2] + 30],
        position: [a1[0] + out.x * 520 + side.x * 260, a1[1] + out.y * 520 + side.y * 260, a1[2] + 260],
      };
    case 'actuator': {
      const mid: Vec3 = [a1[0] * 0.8, a1[1] * 0.8, geometry.home_z / 2];
      return { target: mid, position: [mid[0] + out.x * 1250 + side.x * 450, mid[1] + out.y * 1250 + side.y * 450, mid[2] + 260] };
    }
    case 'top':
      return { target: [0, 0, 0], position: [0, -40, 2700] };
    case 'front':
      return { target: [0, 0, 220], position: [0, -2900, 520] };
    case 'ur': {
      const t: Vec3 = [UR_BASE[0], UR_BASE[1], UR_BASE[2] + 380];
      return { target: t, position: [t[0] + 1250, t[1] - 1650, t[2] + 700] };
    }
    case 'both':
      return { target: [-760, 0, 180], position: [650, -3700, 1450] };
    default:
      return { target: [0, 0, 150], position: [1650, -1900, 1150] };
  }
}

/** Leva a câmera até a tomada da etapa (depois o usuário pode girar à vontade). */
function CameraRig({ shot }: { shot: Shot }) {
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const moving = useRef(true);
  const goal = useMemo(() => {
    const target = new THREE.Vector3(...shot.target);
    // as tomadas foram pensadas para um quadro ~4:3; num painel estreito, recua a câmera
    const k = Math.max(1, 1.05 / aspect);
    const pos = new THREE.Vector3(...shot.position).sub(target).multiplyScalar(k).add(target);
    return { pos, target };
  }, [shot, aspect]);
  useEffect(() => {
    moving.current = true;
  }, [goal]);
  useFrame((_, dt) => {
    if (!moving.current || !controls) return;
    const k = 1 - Math.exp(-Math.min(dt, 0.1) * 4);
    camera.position.lerp(goal.pos, k);
    controls.target.lerp(goal.target, k);
    controls.update();
    if (camera.position.distanceTo(goal.pos) < 2 && controls.target.distanceTo(goal.target) < 2) moving.current = false;
  });
  // o usuário pegou a câmera: para de puxar
  useEffect(() => {
    if (!controls) return;
    const stop = () => (moving.current = false);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  return null;
}

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Coreografia da página inicial (etapas só de leitura). */
function ShowcaseClock({ homeZ, onPose }: { homeZ: number; onPose: (p: Pose) => void }) {
  const t = useRef(0);
  const [reduced] = useState(reducedMotion);
  useFrame((_, dt) => {
    if (reduced) return;
    t.current += Math.min(dt, 0.1);
    onPose(showcasePose(t.current, homeZ).pose);
  });
  return null;
}

/** Cena 3D da aula: a Stewart, o UR5e ou os dois, com as sobreposições da etapa. */
export function LessonScene({ spec, geometry, background }: { spec: SceneSpec; geometry: PlatformGeometry; background: string }) {
  const shot = useMemo(() => cameraShot(spec.camera ?? 'iso', geometry), [spec.camera, geometry]);
  const showcase = useRef<Pose | null>(null);
  const getPose = useCallback(() => (spec.showcase && showcase.current ? showcase.current : useLessonScene.getState().pose), [spec.showcase]);
  const stewart = spec.show !== 'ur5e';
  const ur = spec.show !== 'stewart';

  return (
    <Canvas shadows dpr={[1, 1.75]} camera={{ position: shot.position, up: [0, 0, 1], fov: 30, near: 5, far: 20000 }} gl={{ toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 5000, 11000]} />
      <OrbitControls makeDefault enablePan={false} minDistance={400} maxDistance={9000} enableDamping maxPolarAngle={1.52} />
      <CameraRig shot={shot} />
      <StudioLights high={false} />
      {spec.showcase && (
        <ShowcaseClock
          homeZ={geometry.home_z}
          onPose={(p) => {
            showcase.current = p;
          }}
        />
      )}
      {stewart && (
        <>
          <PremiumRig geometry={geometry} getPose={getPose} />
          {spec.overlays && !spec.showcase && <LessonOverlays geometry={geometry} flags={spec.overlays} />}
        </>
      )}
      {ur && <UR5eScene />}
      <StudioStage color={background} high={false} />
    </Canvas>
  );
}
