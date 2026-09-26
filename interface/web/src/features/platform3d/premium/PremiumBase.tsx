import { useMemo } from 'react';
import * as THREE from 'three';
import type { PlatformGeometry } from '@/lib/types';
import { BlueMount } from '../BlueMount';
import { baseLayout, offsetConvex, type Vec2 } from '../geometry';
import { ModelSlot } from '../ModelSlot';
import { extrudeAlongY, PM, tSlotShape } from './assets';
import { Electronics } from './Electronics';
import { Instances } from './Instances';

// dimensões da estrutura (mm)
export const BASE = {
  mount: 40, // bloco azul sob as juntas
  ring: 10, // chapa do anel
  ringMargin: 70,
  shortEdge: 170, // lado curto do anel sob cada bloco azul, com um perfil em cada ponta
  ringWidth: 105,
  post: 40,
  postHeight: 240,
  tray: 4,
  trayLip: 24,
  trayMargin: 0, // a bandeja da elétrica tem o mesmo contorno do anel
  foot: 30,
} as const;

export const PREMIUM_FLOOR_Z = -(BASE.mount + BASE.ring + BASE.postHeight + BASE.tray + BASE.foot);

const shape = (poly: Vec2[]) => new THREE.Shape(poly.map(([x, y]) => new THREE.Vector2(x, y)));
const path = (poly: Vec2[]) => new THREE.Path(poly.map(([x, y]) => new THREE.Vector2(x, y)));

function extrudeZ(s: THREE.Shape, depth: number, bevel = 1.5) {
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2 });
  g.computeVertexNormals();
  return g;
}

/** Estrutura fixa da Bancada 3D, detalhada a partir das fotos. */
export function PremiumBase({ geometry }: { geometry: PlatformGeometry }) {
  const parts = useMemo(() => {
    const layout = baseLayout(geometry.base_points, BASE.ringMargin, BASE.shortEdge, BASE.post);
    const outer = layout.outline;
    const inner = offsetConvex(outer, -BASE.ringWidth);
    const ringShape = shape(outer);
    ringShape.holes.push(path([...inner].reverse()));
    const trayOuter = offsetConvex(outer, BASE.trayMargin);
    const lipShape = shape(trayOuter);
    lipShape.holes.push(path([...offsetConvex(trayOuter, -4)].reverse()));
    const { posts, edges } = layout;
    const mounts = [0, 2, 4].map((i) => {
      const a = geometry.base_points[i];
      const b = geometry.base_points[i + 1];
      return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, yaw: Math.atan2(b[1] - a[1], b[0] - a[0]) };
    });
    // parafusos: dois em cada bloco azul e um em cada canto do anel
    const bolts: [number, number, number][] = [];
    for (const m of mounts) {
      for (const s of [-1, 1]) bolts.push([m.x + Math.cos(m.yaw) * 45 * s, m.y + Math.sin(m.yaw) * 45 * s, 0]);
    }
    for (const [x, y] of offsetConvex(outer, -22)) bolts.push([x, y, 0]);
    return {
      ring: extrudeZ(ringShape, BASE.ring),
      tray: extrudeZ(shape(trayOuter), BASE.tray, 1),
      lip: extrudeZ(lipShape, BASE.trayLip, 1),
      post: extrudeAlongY(tSlotShape(BASE.post), BASE.postHeight, 0.4),
      posts,
      mounts,
      bolts,
      edges,
      // parte elétrica: régua azul apontada para a ponta das juntas 5-6
      electronicsAngle: Math.atan2(edges[2].center[1], edges[2].center[0]),
    };
  }, [geometry]);

  const ringTop = -BASE.mount;
  const ringBottom = ringTop - BASE.ring;
  const postBottom = ringBottom - BASE.postHeight;
  const trayBottom = postBottom - BASE.tray;
  // DB37: no meio do lado curto das juntas 1-2, rente às faces de fora dos perfis
  const e0 = parts.edges[0];
  const db37 = {
    bracket: e0.center,
    yaw: Math.atan2(e0.n[1], e0.n[0]),
    z: postBottom + 55,
    // copos de solda (onde chegam os fios da régua), 9 mm atrás do flange
    rear: [e0.center[0] - e0.n[0] * 7, e0.center[1] - e0.n[1] * 7, postBottom + 55] as [number, number, number],
  };
  const boltGeo = useMemo(() => new THREE.CylinderGeometry(5.5, 5.5, 4, 6), []);
  const boltRot = useMemo(() => new THREE.Euler(Math.PI / 2, 0, 0), []);

  return (
    <group>
      <mesh geometry={parts.ring} material={PM.powderBlack} position={[0, 0, ringBottom]} castShadow receiveShadow />
      <Instances
        geometry={boltGeo}
        material={PM.darkSteel}
        rotation={boltRot}
        positions={parts.bolts.map(([x, y]) => [x, y, ringTop + 2])}
      />

      {/* perfis 40×40 com canais em T (extrudados ao longo de Y, girados para Z) */}
      {parts.posts.map(({ x, y, yaw }, i) => (
        <group key={i} position={[x, y, postBottom]} rotation={[0, 0, yaw]}>
          <mesh geometry={parts.post} material={PM.anodized} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow />
        </group>
      ))}

      {/* bandeja inferior com borda */}
      <mesh geometry={parts.tray} material={PM.powderBlack} position={[0, 0, trayBottom]} receiveShadow castShadow />
      <mesh geometry={parts.lip} material={PM.powderBlack} position={[0, 0, trayBottom]} castShadow />

      {/* pés niveladores */}
      {parts.posts.map(({ x, y }, i) => (
        <group key={i} position={[x, y, PREMIUM_FLOOR_Z]}>
          <mesh material={PM.rubber} position={[0, 0, 6]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[26, 30, 12, 32]} />
          </mesh>
          <mesh material={PM.chrome} position={[0, 0, 20]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[6, 6, 18, 16]} />
          </mesh>
        </group>
      ))}

      {parts.mounts.map((m, i) => (
        <BlueMount key={i} x={m.x} y={m.y} yaw={m.yaw} />
      ))}

      <Electronics z={postBottom} floor={-(BASE.tray + BASE.foot)} angle={parts.electronicsAngle} db37Rear={db37.rear} />

      {/* DB37 fêmea entre os perfis sob os pistões 1 e 2, num suporte branco abraçando os perfis */}
      <group position={[db37.bracket[0], db37.bracket[1], db37.z]} rotation={[0, 0, db37.yaw]}>
        <mesh material={PM.whitePlastic} position={[1, 0, 0]} castShadow>
          <boxGeometry args={[2, BASE.shortEdge - 30, 26]} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} material={PM.whitePlastic} position={[-BASE.post / 2, s * (BASE.shortEdge / 2 - BASE.post / 2), 0]} castShadow>
            <boxGeometry args={[BASE.post + 4, BASE.post + 4, 18]} />
          </mesh>
        ))}
        <group position={[2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <group rotation={[Math.PI / 2, 0, 0]}>
            <ModelSlot name="db37-female" zUp>
              <mesh material={PM.aluminum} position={[0, 0, 3]}>
                <boxGeometry args={[69.4, 12.55, 6]} />
              </mesh>
            </ModelSlot>
          </group>
        </group>
      </group>

    </group>
  );
}
