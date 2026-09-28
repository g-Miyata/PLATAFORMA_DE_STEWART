import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { Pose, Vec3 } from '@/lib/types';
import { PM } from './assets';

// Junta do tampo como na bancada: o cardã fica logo abaixo do tampo, com o garfo de cima
// no eixo do tampo, e um parafuso atravessa o tampo por cima (cabeça sextavada em cima).
// Medidas do cardã: 3D-drawings-archives/blender/kardan.py.

/** do centro da cruzeta à face do cubo do garfo (que encosta no tampo) */
export const CARDAN_HUB = 23;
const SCREW_R = 4;
const HEAD_R = 7.5; // M8: 13 mm entre faces
const HEAD_H = 5.3;
const THREAD_IN = 10; // quanto o parafuso entra no cubo

/** Garfo do cardã, eixo +Y (da cruzeta para fora), orelhas em ±X. */
export function Yoke({ neck, material = PM.chrome }: { neck: boolean; material?: THREE.Material }) {
  return (
    <group>
      <mesh material={material} position={[0, 17, 0]} castShadow>
        <cylinderGeometry args={[9.5, 9.5, 12, 28]} />
      </mesh>
      {neck && (
        <mesh material={material} position={[0, 26, 0]} castShadow>
          <cylinderGeometry args={[7, 7, 10, 24]} />
        </mesh>
      )}
      {[-11.5, 11.5].map((x) => (
        <group key={x}>
          <mesh material={material} position={[x, 7.5, 0]} castShadow>
            <boxGeometry args={[5.5, 15, 16]} />
          </mesh>
          <mesh material={material} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[8, 8, 5.5, 24]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const _y = new THREE.Vector3();
const _x = new THREE.Vector3();
const _z = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Orienta um objeto com +Y em `axis` e +X no pino (ortogonalizado). */
function orient(q: THREE.Quaternion, axis: THREE.Vector3, pin: THREE.Vector3) {
  _y.copy(axis).normalize();
  _x.copy(pin).addScaledVector(_y, -pin.dot(_y)).normalize();
  _z.crossVectors(_x, _y);
  q.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

export interface CardanFrame {
  /** centro da cruzeta (mundo) */
  center: THREE.Vector3;
  /** eixo do garfo de cima: a normal do tampo (para cima) */
  up: THREE.Vector3;
  /** eixo do garfo de baixo: da cruzeta para a perna */
  down: THREE.Vector3;
}

/**
 * Cardã do tampo articulado: o garfo de cima segue o tampo e o de baixo segue a perna,
 * então o ângulo entre eles é o ângulo real da junta. `get` é lido a cada quadro.
 */
export function TopCardan({ get, over = false }: { get: () => CardanFrame | null; over?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Group>(null);
  const lower = useRef<THREE.Group>(null);
  const pinA = useRef<THREE.Mesh>(null);
  const pinB = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const f = get();
    if (!f || !root.current || !upper.current || !lower.current || !pinA.current || !pinB.current) return;
    root.current.position.copy(f.center);
    // pino do garfo de cima: perpendicular aos dois eixos (sem dobra, qualquer um)
    _a.crossVectors(f.up, f.down);
    if (_a.lengthSq() < 1e-8) _a.set(1, 0, 0).addScaledVector(f.up, -f.up.x);
    _a.normalize();
    _b.crossVectors(_a, f.down).normalize();
    orient(upper.current.quaternion, f.up, _a);
    orient(lower.current.quaternion, f.down, _b);
    orient(pinA.current.quaternion, _a, f.up);
    orient(pinB.current.quaternion, _b, f.down);
  });

  return (
    <group ref={root}>
      <group ref={upper}>
        <Yoke neck={false} />
      </group>
      <group ref={lower}>
        <Yoke neck />
      </group>
      <mesh material={over ? OVER : PM.darkSteel}>
        <boxGeometry args={[9, 9, 9]} />
      </mesh>
      <mesh ref={pinA} material={PM.chrome}>
        <cylinderGeometry args={[3.4, 3.4, 30, 16]} />
      </mesh>
      <mesh ref={pinB} material={PM.chrome}>
        <cylinderGeometry args={[3.4, 3.4, 30, 16]} />
      </mesh>
    </group>
  );
}

const OVER = new THREE.MeshStandardMaterial({ color: '#e5484d', emissive: '#e5484d', emissiveIntensity: 0.5 });

/**
 * Parafusos que prendem os cardãs ao tampo, no referencial do tampo: haste do cubo do
 * cardã até em cima do tampo e cabeça sextavada por cima.
 */
export function PlateBolts({ points, plateBottom, plateThickness }: { points: readonly Vec3[]; plateBottom: number; plateThickness: number }) {
  const shankFrom = plateBottom - THREAD_IN;
  const shankTo = plateBottom + plateThickness;
  return (
    <>
      {points.map(([x, y], i) => (
        <group key={i} position={[x, y, 0]}>
          <mesh material={PM.darkSteel} position={[0, 0, (shankFrom + shankTo) / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[SCREW_R, SCREW_R, shankTo - shankFrom, 16]} />
          </mesh>
          <mesh material={PM.darkSteel} position={[0, 0, shankTo + 0.6]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[HEAD_R + 1.5, HEAD_R + 1.5, 1.2, 24]} />
          </mesh>
          <mesh material={PM.darkSteel} position={[0, 0, shankTo + 1.2 + HEAD_H / 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[HEAD_R, HEAD_R, HEAD_H, 6]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

const _n = new THREE.Vector3();
const _e = new THREE.Euler();
const DEG = Math.PI / 180;

/** Normal do tampo (+Z do tampo no mundo) para uma pose. */
export function plateNormal(pose: Pose, out = _n) {
  _e.set(pose.roll * DEG, pose.pitch * DEG, pose.yaw * DEG, 'ZYX');
  return out.set(0, 0, 1).applyEuler(_e);
}

/** Quadro do cardã do tampo de uma perna: centro, normal do tampo e direção da perna. */
export function cardanFrame(top: Vec3, base: Vec3, pose: Pose, out?: CardanFrame): CardanFrame {
  const f = out ?? { center: new THREE.Vector3(), up: new THREE.Vector3(), down: new THREE.Vector3() };
  f.center.set(top[0], top[1], top[2]);
  plateNormal(pose, f.up);
  f.down.set(base[0] - top[0], base[1] - top[1], base[2] - top[2]).normalize();
  return f;
}
