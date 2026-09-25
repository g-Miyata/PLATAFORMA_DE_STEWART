import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PISTON_COLORS } from '@/lib/pistons';
import { DIM } from './geometry';
import { MAT, STATUS_EMISSIVE } from './materials';
import { ModelSlot } from './ModelSlot';
import type { SceneStore } from './sceneState';

/** Junta universal (Kardan) simplificada: cruzeta + garfo, cromada. */
function Kardan() {
  return (
    <group>
      <mesh material={MAT.chrome} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[4.5, 4.5, 30, 12]} />
      </mesh>
      <mesh material={MAT.chrome} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[4.5, 4.5, 30, 12]} />
      </mesh>
      <mesh material={MAT.chrome} position={[0, -9, 0]}>
        <boxGeometry args={[24, 8, 24]} />
      </mesh>
      <mesh material={MAT.chrome} position={[0, 9, 0]}>
        <boxGeometry args={[24, 8, 24]} />
      </mesh>
    </group>
  );
}

const HOUSING_START = DIM.jointOffset + 10;
const MOTOR_X = DIM.housingRadius + DIM.motorRadius + 3;

// vetores de trabalho reaproveitados a cada frame
const vY = new THREE.Vector3();
const vX = new THREE.Vector3();
const vZ = new THREE.Vector3();
const vR = new THREE.Vector3();
const basis = new THREE.Matrix4();

/**
 * Um atuador linear: sistema local com origem na junta da base, +Y ao longo da
 * perna e +X para fora da plataforma (lado do motor). A haste desliza em Y.
 */
function Actuator({ index, store }: { index: number; store: SceneStore }) {
  const group = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const housing = useRef<THREE.Group>(null);
  // Material próprio da carcaça: o brilho (emissive) indica o estado do curso
  const housingMat = useMemo(() => {
    const m = MAT.aluminum.clone();
    m.userData.tint = true;
    return m;
  }, []);
  const bandMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: PISTON_COLORS[index], roughness: 0.4, metalness: 0.1 }),
    [index],
  );

  useFrame(() => {
    if (!group.current || !rod.current || !top.current) return;
    const b = store.geometry.base_points[index];
    const p = store.solid.top[index];
    vY.set(p[0] - b[0], p[1] - b[1], p[2] - b[2]);
    const L = vY.length();
    vY.divideScalar(L || 1);
    vR.set(b[0], b[1], 0).normalize();
    vX.copy(vR).addScaledVector(vY, -vR.dot(vY)).normalize();
    vZ.crossVectors(vX, vY);
    basis.makeBasis(vX, vY, vZ);
    group.current.position.set(b[0], b[1], b[2]);
    group.current.quaternion.setFromRotationMatrix(basis);
    rod.current.position.set(0, L - DIM.jointOffset - DIM.rodLength / 2, 0);
    top.current.position.set(0, L, 0);
    const glow = STATUS_EMISSIVE[store.solid.status[index]];
    housing.current?.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (mat?.userData?.tint && mat.emissive) mat.emissive.copy(glow);
    });
  });

  return (
    <group ref={group}>
      <Kardan />
      <group ref={housing}>
        <ModelSlot name="actuator-housing">
          {/* caixa de redução */}
          <mesh position={[16, DIM.jointOffset + 34, 0]} material={MAT.aluminumDark} castShadow>
            <boxGeometry args={[62, 64, 44]} />
          </mesh>
          {/* motor paralelo ao tubo */}
          <mesh position={[MOTOR_X, DIM.jointOffset + 20 + DIM.motorLength / 2, 0]} material={MAT.aluminum} castShadow>
            <cylinderGeometry args={[DIM.motorRadius, DIM.motorRadius, DIM.motorLength, 28]} />
          </mesh>
          <mesh position={[MOTOR_X, DIM.jointOffset + 20 + DIM.motorLength + 3, 0]} material={MAT.blackRubber}>
            <cylinderGeometry args={[DIM.motorRadius - 2, DIM.motorRadius - 2, 6, 28]} />
          </mesh>
          {/* tubo externo */}
          <mesh position={[0, HOUSING_START + DIM.housingLength / 2, 0]} material={housingMat} castShadow>
            <cylinderGeometry args={[DIM.housingRadius, DIM.housingRadius, DIM.housingLength, 32]} />
          </mesh>
          {/* bucha preta no topo do tubo */}
          <mesh position={[0, HOUSING_START + DIM.housingLength - 6, 0]} material={MAT.blackRubber}>
            <cylinderGeometry args={[DIM.housingRadius + 1, DIM.housingRadius + 1, 12, 32]} />
          </mesh>
        </ModelSlot>
      </group>
      {/* faixa com a cor do pistão (fica mesmo com o modelo do Blender) */}
      <mesh position={[0, HOUSING_START + DIM.housingLength - 38, 0]} material={bandMat}>
        <cylinderGeometry args={[DIM.housingRadius + 0.8, DIM.housingRadius + 0.8, 12, 32]} />
      </mesh>
      {/* haste cromada (desliza) */}
      <group ref={rod}>
        <ModelSlot name="actuator-rod">
          <mesh material={MAT.chrome} castShadow>
            <cylinderGeometry args={[DIM.rodRadius, DIM.rodRadius, DIM.rodLength, 24]} />
          </mesh>
        </ModelSlot>
      </group>
      <group ref={top}>
        <ModelSlot name="kardan-top">
          <Kardan />
        </ModelSlot>
      </group>
    </group>
  );
}

const INDICES = [0, 1, 2, 3, 4, 5];

/** Os seis atuadores, reposicionados a cada frame a partir de B e dos pontos do tampo. */
export function Actuators({ store }: { store: SceneStore }) {
  return (
    <group>
      {INDICES.map((i) => (
        <Actuator key={i} index={i} store={store} />
      ))}
    </group>
  );
}
