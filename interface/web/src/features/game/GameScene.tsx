import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { DIM } from '@/features/platform3d/geometry';
import { PremiumRig } from '@/features/platform3d/premium/PremiumRig';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import { applyPose } from '@/features/platform3d/TopPlate';
import type { PlatformGeometry, Pose } from '@/lib/types';
import { BALL_R, WALL_HALF, type Vec2, type Wall } from './ballPhysics';
import type { GameEngine } from './engine';

/** superfície do tampo acima do centro das juntas (mesmo desenho do PremiumRig) */
const SURFACE = DIM.topPlateGap + DIM.topPlateThickness + 1.5;

const mat = {
  rim: new THREE.MeshStandardMaterial({ color: '#2a2e33', roughness: 0.6 }),
  wall: new THREE.MeshStandardMaterial({ color: '#d7dbe0', roughness: 0.45, metalness: 0.3 }),
  hole: new THREE.MeshBasicMaterial({ color: '#050505' }),
  holeRing: new THREE.MeshStandardMaterial({ color: '#3a3f45', roughness: 0.5 }),
  goal: new THREE.MeshStandardMaterial({ color: '#2f9e41', emissive: '#2f9e41', emissiveIntensity: 0.6, transparent: true, opacity: 0.55 }),
  goalRing: new THREE.MeshStandardMaterial({ color: '#58d26b', emissive: '#58d26b', emissiveIntensity: 1.1 }),
  start: new THREE.MeshStandardMaterial({ color: '#8a929a', roughness: 0.6 }),
  ball: new THREE.MeshPhysicalMaterial({ color: '#d42a2a', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1 }),
};

function WallBox({ w, height, material }: { w: Wall; height: number; material: THREE.Material }) {
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const angle = Math.atan2(w.b[1] - w.a[1], w.b[0] - w.a[0]);
  return (
    <mesh material={material} position={[(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2, SURFACE + height / 2]} rotation={[0, 0, angle]} castShadow receiveShadow>
      <boxGeometry args={[len + WALL_HALF * 2, WALL_HALF * 2, height]} />
    </mesh>
  );
}

function Board({ engine, outline }: { engine: GameEngine; outline: Vec2[] }) {
  const level = engine.level;
  const rim = useMemo(() => outline.map((a, i) => ({ a, b: outline[(i + 1) % outline.length] })), [outline]);
  return (
    <group>
      {rim.map((w, i) => (
        <WallBox key={i} w={w} height={14} material={mat.rim} />
      ))}
      {level.walls.map((w, i) => (
        <WallBox key={i} w={w} height={24} material={mat.wall} />
      ))}
      {level.holes.map((h, i) => (
        <group key={i} position={[h.x, h.y, SURFACE + 0.4]}>
          <mesh material={mat.hole}>
            <circleGeometry args={[h.r, 40]} />
          </mesh>
          <mesh material={mat.holeRing} position={[0, 0, 0.2]}>
            <ringGeometry args={[h.r, h.r + 3, 40]} />
          </mesh>
        </group>
      ))}
      <group position={[level.goal.x, level.goal.y, SURFACE + 0.5]}>
        <mesh material={mat.goal}>
          <circleGeometry args={[level.goal.r, 48]} />
        </mesh>
        <mesh material={mat.goalRing} position={[0, 0, 0.3]}>
          <ringGeometry args={[level.goal.r - 3, level.goal.r, 48]} />
        </mesh>
      </group>
      <mesh material={mat.start} position={[level.start[0], level.start[1], SURFACE + 0.4]}>
        <ringGeometry args={[BALL_R + 2, BALL_R + 5, 32]} />
      </mesh>
    </group>
  );
}

function BallMesh({ engine }: { engine: GameEngine }) {
  const ref = useRef<THREE.Mesh>(null);
  const last = useRef<Vec2>([engine.ball.x, engine.ball.y]);
  const axis = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const { x, y } = engine.ball;
    const dx = x - last.current[0];
    const dy = y - last.current[1];
    const dist = Math.hypot(dx, dy);
    // rola sem deslizar: gira em torno do eixo perpendicular ao deslocamento
    if (dist > 1e-6 && dist < 50) {
      axis.set(-dy / dist, dx / dist, 0);
      q.setFromAxisAngle(axis, dist / BALL_R);
      m.quaternion.premultiply(q);
    }
    last.current = [x, y];
    const falling = engine.phase === 'caiu';
    m.visible = !falling;
    m.position.set(x, y, SURFACE + BALL_R);
  });
  return (
    <mesh ref={ref} material={mat.ball} castShadow>
      <sphereGeometry args={[BALL_R, 32, 24]} />
    </mesh>
  );
}

function Plate({ engine, outline, getPose }: { engine: GameEngine; outline: Vec2[]; getPose: () => Pose }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) applyPose(group.current, getPose());
  });
  return (
    <group ref={group}>
      <Board key={engine.levelIndex} engine={engine} outline={outline} />
      <BallMesh engine={engine} />
    </group>
  );
}

function Driver({ engine }: { engine: GameEngine }) {
  useFrame((_, dt) => engine.frame(Math.min(dt, 0.05)));
  return null;
}

function Aim() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.lookAt(0, 0, 520);
  }, [camera]);
  return null;
}

interface GameSceneProps {
  engine: GameEngine;
  geometry: PlatformGeometry;
  outline: Vec2[];
  getPose: () => Pose;
  background: string;
  /** muda a cada troca de fase para redesenhar o tabuleiro */
  levelKey: number;
}

/** Bancada premium com o tabuleiro preso ao tampo; câmera fixa atrás (↑ = +X). */
export function GameScene({ engine, geometry, outline, getPose, background, levelKey }: GameSceneProps) {
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 4200, 9000]} />
      <Aim />
      <Driver engine={engine} />
      <StudioLights high />
      <PremiumRig geometry={geometry} getPose={getPose} />
      <Plate key={levelKey} engine={engine} outline={outline} getPose={getPose} />
      <StudioStage color={background} high />
    </>
  );
}
