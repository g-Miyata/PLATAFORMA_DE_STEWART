import { useMemo } from 'react';
import * as THREE from 'three';
import type { PlatformGeometry } from '@/lib/types';
import { convexHull, DIM, FLOOR_Z, offsetConvex, xy, type Vec2 } from './geometry';
import { BlueMount } from './BlueMount';
import { MAT } from './materials';

const shapeFrom = (poly: Vec2[]) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));

function extrude(shape: THREE.Shape, depth: number, bevel = 2) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
  });
  g.computeVertexNormals();
  return g;
}

/** Estrutura fixa: anel da base, perfis 40x40, placa inferior, elétrica e blocos azuis. */
export function BaseFrame({ geometry }: { geometry: PlatformGeometry }) {
  const parts = useMemo(() => {
    const hull = convexHull(xy(geometry.base_points));
    const outer = offsetConvex(hull, DIM.baseMargin);
    const inner = offsetConvex(outer, -DIM.baseRingWidth);
    const ringShape = shapeFrom(outer);
    ringShape.holes.push(new THREE.Path(inner.map(([x, y]) => new THREE.Vector2(x, y)).reverse()));
    const bottom = offsetConvex(outer, DIM.bottomMargin);

    // Um poste em cada vértice do anel, recuado para ficar sob a chapa
    const posts = offsetConvex(outer, -DIM.postSize).map(([x, y]) => [x, y] as Vec2);

    // Um bloco azul por par de juntas (0-1, 2-3, 4-5), virado para o centro
    const mounts = [0, 2, 4].map((i) => {
      const a = geometry.base_points[i];
      const b = geometry.base_points[i + 1];
      const cx = (a[0] + b[0]) / 2;
      const cy = (a[1] + b[1]) / 2;
      return { x: cx, y: cy, yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    });

    return {
      ring: extrude(ringShape, DIM.baseRingThickness),
      bottomPlate: extrude(shapeFrom(bottom), DIM.bottomPlateThickness),
      posts,
      mounts,
      corner: outer[0],
    };
  }, [geometry]);

  const ringTop = -DIM.mountHeight;
  const ringBottom = ringTop - DIM.baseRingThickness;
  const postTop = ringBottom;
  const postBottom = postTop - DIM.postHeight;
  const plateBottom = postBottom - DIM.bottomPlateThickness;

  return (
    <group>
      <mesh geometry={parts.ring} material={MAT.blackPlate} position={[0, 0, ringBottom]} castShadow receiveShadow />
      <mesh geometry={parts.bottomPlate} material={MAT.blackPlate} position={[0, 0, plateBottom]} castShadow receiveShadow />

      {parts.posts.map(([x, y], i) => (
        <mesh key={i} position={[x, y, (postTop + postBottom) / 2]} material={MAT.profile} castShadow>
          <boxGeometry args={[DIM.postSize, DIM.postSize, DIM.postHeight]} />
        </mesh>
      ))}

      {parts.posts.filter((_, i) => i % 2 === 0).map(([x, y], i) => (
        <mesh key={i} position={[x, y, FLOOR_Z + DIM.footHeight / 2]} material={MAT.blackRubber} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[22, 26, DIM.footHeight, 20]} />
        </mesh>
      ))}

      {parts.mounts.map((m, i) => (
        <BlueMount key={i} x={m.x} y={m.y} yaw={m.yaw} />
      ))}

      {/* Parte elétrica sobre a placa inferior (fonte, canaletas, botão de emergência) */}
      <group position={[0, 0, postBottom]}>
        <mesh position={[-40, -60, 35]} material={MAT.psu} castShadow>
          <boxGeometry args={[215, 115, 50]} />
        </mesh>
        <mesh position={[40, 95, 25]} material={MAT.greyDuct}>
          <boxGeometry args={[260, 40, 50]} />
        </mesh>
        <mesh position={[120, -20, 25]} rotation={[0, 0, Math.PI / 2]} material={MAT.greyDuct}>
          <boxGeometry args={[220, 40, 50]} />
        </mesh>
      </group>
      <group position={[parts.corner[0] + 10, parts.corner[1] - 10, postBottom]}>
        <mesh position={[0, 0, 30]} material={MAT.estopYellow} castShadow>
          <boxGeometry args={[70, 70, 60]} />
        </mesh>
        <mesh position={[0, 0, 70]} rotation={[Math.PI / 2, 0, 0]} material={MAT.estopRed}>
          <cylinderGeometry args={[22, 22, 20, 24]} />
        </mesh>
      </group>
    </group>
  );
}
