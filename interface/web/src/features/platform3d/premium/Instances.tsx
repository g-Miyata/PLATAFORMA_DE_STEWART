import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

/** Instâncias iguais (parafusos, bornes, ranhuras): um único draw call. */
export function Instances({
  geometry,
  material,
  positions,
  rotation,
}: {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  positions: [number, number, number][];
  rotation?: THREE.Euler;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler());
    positions.forEach((p, i) => {
      m.compose(new THREE.Vector3(...p), q, new THREE.Vector3(1, 1, 1));
      ref.current?.setMatrixAt(i, m);
    });
    if (ref.current) {
      ref.current.instanceMatrix.needsUpdate = true;
      ref.current.computeBoundingSphere();
    }
  }, [positions, rotation]);
  return <instancedMesh ref={ref} args={[geometry, material, positions.length]} castShadow receiveShadow />;
}
