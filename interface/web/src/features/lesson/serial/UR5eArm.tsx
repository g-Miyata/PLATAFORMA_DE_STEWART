import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Component, Suspense, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { PREMIUM_FLOOR_Z } from '@/features/platform3d/premium/PremiumBase';
import type { Vec3 } from '@/lib/types';
import { Dot, Frame, Label } from '../Overlays';
import { useLessonScene } from '../lessonStore';
import { fkChain, UR5E_BODIES, type UrBody } from './ur5e';

/** Onde o UR5e fica na cena da aula (mm): à esquerda da Stewart, sobre um pedestal. */
const PEDESTAL_MM = 420;
export const UR_BASE: Vec3 = [-1500, 0, PREMIUM_FLOOR_Z + PEDESTAL_MM];
const M = 1000;

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const GHOST = new THREE.MeshStandardMaterial({ color: '#b55cf2', transparent: true, opacity: 0.22, depthWrite: false, roughness: 0.6 });

function BodyMesh({ name, ghost }: { name: UrBody['name']; ghost: boolean }) {
  const { scene } = useGLTF(`/models/serial/ur5e-${name}.glb`, false, true);
  const object = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = !ghost;
      mesh.receiveShadow = !ghost;
      if (ghost) mesh.material = GHOST;
    });
    return o;
  }, [scene, ghost]);
  return <primitive object={object} />;
}

/** Peça procedural se o .glb faltar: um cilindro na direção do elo. */
function ProceduralBody({ i }: { i: number }) {
  const next = UR5E_BODIES[i + 1]?.pos ?? [0, 0.08, 0];
  const len = Math.hypot(...next) || 0.08;
  return (
    <mesh position={[next[0] / 2, next[1] / 2, next[2] / 2]} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...next).normalize())}>
      <cylinderGeometry args={[0.045, 0.045, len, 20]} />
      <meshStandardMaterial color={i % 2 ? '#7db0cc' : '#d0d0d0'} />
    </mesh>
  );
}

function Body({ i, onJoint, ghost }: { i: number; onJoint: (i: number, g: THREE.Group | null) => void; ghost: boolean }) {
  const b = UR5E_BODIES[i];
  const [w, x, y, z] = b.quat;
  return (
    <group position={b.pos} quaternion={[x, y, z, w]}>
      <group ref={(el) => onJoint(i, el)}>
        <Fallback fallback={<ProceduralBody i={i} />}>
          <Suspense fallback={null}>
            <BodyMesh name={b.name} ghost={ghost} />
          </Suspense>
        </Fallback>
        {i < UR5E_BODIES.length - 1 && <Body i={i + 1} onJoint={onJoint} ghost={ghost} />}
      </group>
    </group>
  );
}

const q = new THREE.Quaternion();
const axisV = new THREE.Vector3();

/** Um UR5e (ou um fantasma dele) com os ângulos lidos a cada quadro. */
function Arm({ getTheta, ghost = false }: { getTheta: () => number[]; ghost?: boolean }) {
  const joints = useRef<(THREE.Group | null)[]>([]);
  useFrame(() => {
    const theta = getTheta();
    UR5E_BODIES.forEach((b, i) => {
      const g = joints.current[i];
      if (!g || !b.axis) return;
      g.quaternion.copy(q.setFromAxisAngle(axisV.set(...b.axis), theta[i - 1] ?? 0));
    });
  });
  return (
    <Body
      i={0}
      onJoint={(i, g) => {
        joints.current[i] = g;
      }}
      ghost={ghost}
    />
  );
}

const toWorld = (p: readonly number[]): Vec3 => [UR_BASE[0] + p[0] * M, UR_BASE[1] + p[1] * M, UR_BASE[2] + p[2] * M];

/** Referenciais DH de cada junta (⁰Tᵢ), desenhados em mm na cena. */
function DhFrames({ theta }: { theta: number[] }) {
  const frames = useMemo(() => fkChain(theta), [theta]);
  return (
    <group>
      {frames.map((T, i) => (
        <Frame
          key={i}
          origin={toWorld([T[3], T[7], T[11]])}
          axes={[
            [T[0], T[4], T[8]],
            [T[1], T[5], T[9]],
            [T[2], T[6], T[10]],
          ]}
          size={i === 6 ? 110 : 80}
          name={i === 0 ? '{0}' : i === 6 ? '{6} ferramenta' : `{${i}}`}
        />
      ))}
    </group>
  );
}

/** O UR5e da aula: braço principal, fantasmas das outras soluções, referenciais e alvo. */
export function UR5eScene() {
  const ur = useLessonScene((s) => s.ur);
  const ghosts = useLessonScene((s) => s.urGhosts);
  const target = useLessonScene((s) => s.urTarget);
  const frames = useLessonScene((s) => s.urFrames);
  return (
    <group>
      {/* pedestal */}
      <mesh position={[UR_BASE[0], UR_BASE[1], PREMIUM_FLOOR_Z + PEDESTAL_MM / 2]} castShadow receiveShadow>
        <boxGeometry args={[300, 300, PEDESTAL_MM]} />
        <meshStandardMaterial color="#3b4046" roughness={0.7} />
      </mesh>
      <group position={UR_BASE} scale={M}>
        <Arm getTheta={() => useLessonScene.getState().ur} />
        {ghosts.map((g, i) => (
          <Arm key={i} getTheta={() => g} ghost />
        ))}
      </group>
      {frames && <DhFrames theta={ur} />}
      {target && (
        <>
          <Dot at={toWorld(target)} color="#f5b400" size={16} />
          <Label at={toWorld([target[0], target[1], target[2] + 0.06])} color="#f5b400">
            alvo
          </Label>
        </>
      )}
    </group>
  );
}
