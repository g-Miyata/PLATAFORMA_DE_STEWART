import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PlatformGeometry } from '@/lib/types';
import { DIM } from './geometry';
import { STATUS_LINE } from './materials';
import type { SceneStore } from './sceneState';
import { applyPose, usePlateGeometry } from './TopPlate';

const colorOf = Object.fromEntries(Object.entries(STATUS_LINE).map(([k, v]) => [k, new THREE.Color(v)])) as Record<
  keyof typeof STATUS_LINE,
  THREE.Color
>;

/** Pose comandada/prevista: tampo translúcido e pernas em linha, coloridas pelo estado do curso. */
export function GhostPlatform({ geometry, store }: { geometry: PlatformGeometry; store: SceneStore }) {
  const plateGroup = useRef<THREE.Group>(null);
  const legsRef = useRef<THREE.LineSegments>(null);
  const { plate } = usePlateGeometry(geometry);

  const legs = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
    return g;
  }, []);
  const legMat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }), []);
  const plateMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#2f9e41', transparent: true, opacity: 0.22, depthWrite: false }),
    [],
  );

  useFrame(() => {
    const ghost = store.ghost;
    const lines = legsRef.current;
    if (!plateGroup.current || !lines) return;
    plateGroup.current.visible = lines.visible = ghost !== null;
    if (!ghost) return;
    applyPose(plateGroup.current, ghost.pose);
    const g = lines.geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < 6; i++) {
      const b = store.geometry.base_points[i];
      const p = ghost.top[i];
      pos.setXYZ(i * 2, b[0], b[1], b[2]);
      pos.setXYZ(i * 2 + 1, p[0], p[1], p[2]);
      const c = colorOf[ghost.status[i]];
      col.setXYZ(i * 2, c.r, c.g, c.b);
      col.setXYZ(i * 2 + 1, c.r, c.g, c.b);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    g.computeBoundingSphere();
  });

  return (
    <group>
      <lineSegments ref={legsRef} geometry={legs} material={legMat} frustumCulled={false} />
      <group ref={plateGroup}>
        <mesh geometry={plate} material={plateMat} position={[0, 0, DIM.topPlateGap]} />
      </group>
    </group>
  );
}
