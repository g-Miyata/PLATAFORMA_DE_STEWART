import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { PlatformGeometry, Pose } from '@/lib/types';
import { convexHull, DIM, offsetConvex, xy } from './geometry';
import { MAT } from './materials';
import type { SceneStore } from './sceneState';

const DEG = Math.PI / 180;

export function applyPose(obj: THREE.Object3D, pose: Pose) {
  obj.position.set(pose.x, pose.y, pose.z);
  // R = Rz(yaw)·Ry(pitch)·Rx(roll): em three.js é a ordem 'ZYX'
  obj.rotation.set(pose.roll * DEG, pose.pitch * DEG, pose.yaw * DEG, 'ZYX');
}

export function usePlateGeometry(geometry: PlatformGeometry) {
  return useMemo(() => {
    const outline = offsetConvex(convexHull(xy(geometry.platform_points_local)), DIM.topMargin);
    const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: DIM.topPlateThickness,
      bevelEnabled: true,
      bevelThickness: 1.5,
      bevelSize: 1.5,
      bevelSegments: 2,
    });
    g.computeVertexNormals();
    return { plate: g, outline };
  }, [geometry]);
}

/** Tampo preto + suportes das juntas superiores, na pose do frame atual. */
export function TopPlate({ geometry, store }: { geometry: PlatformGeometry; store: SceneStore }) {
  const group = useRef<THREE.Group>(null);
  const { plate } = usePlateGeometry(geometry);

  useFrame(() => {
    if (group.current) applyPose(group.current, store.solid.pose);
  });

  return (
    <group ref={group}>
      <mesh geometry={plate} material={MAT.blackPlate} position={[0, 0, DIM.topPlateGap]} castShadow receiveShadow />
      {geometry.platform_points_local.map(([x, y], i) => (
        <mesh key={i} position={[x, y, DIM.topPlateGap / 2 + 4]} material={MAT.aluminumDark} castShadow>
          <boxGeometry args={[26, 26, DIM.topPlateGap - 8]} />
        </mesh>
      ))}
    </group>
  );
}
