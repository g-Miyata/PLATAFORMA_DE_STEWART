import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { PremiumBase } from '@/features/platform3d/premium/PremiumBase';
import { PremiumRig } from '@/features/platform3d/premium/PremiumRig';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import type { PlatformGeometry, Pose } from '@/lib/types';
import type { Grid } from './workspace';

/** Iso-superfície da margem 0 (fronteira do alcançável), translúcida. */
function ReachSurface({ grid }: { grid: Grid }) {
  const invalidate = useThree((s) => s.invalidate);
  const mc = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: '#2f9e41',
      emissive: '#1d6b2a',
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      // desenhado por cima do tampo: o volume fica na altura do próprio tampo
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const m = new MarchingCubes(grid.size, material, false, false, grid.size > 64 ? 400_000 : 120_000);
    m.isolation = 0;
    m.renderOrder = 5;
    return m;
  }, [grid.size]);

  useEffect(() => {
    mc.field.set(grid.data);
    mc.update();
    // o MarchingCubes trabalha em [−1, 1]³: posiciona e escala para a caixa varrida (mm)
    const half = grid.steps.map((s) => (s * grid.size) / 2);
    mc.position.set(grid.origin[0] + half[0], grid.origin[1] + half[1], grid.origin[2] + half[2]);
    mc.scale.set(half[0], half[1], half[2]);
    invalidate();
  }, [mc, grid, invalidate]);

  useEffect(() => () => mc.geometry.dispose(), [mc]);
  return <primitive object={mc} />;
}

/** Cor de cada limite no corte (a mesma da legenda da página). */
export const LIMIT_COLORS: [number, number, number][] = [
  [240, 180, 40], // curso do atuador
  [70, 150, 240], // cardã da base
  [180, 90, 240], // cardã do tampo
  [230, 70, 70], // folga entre pernas
];

/** Corte horizontal em Z: verde longe dos limites; perto, a cor do limite que está mais perto. */
function Slice({ grid, z }: { grid: Grid; z: number }) {
  const { texture, w, h, cx, cy, zz } = useMemo(() => {
    const { size, steps, origin, data, limit } = grid;
    const iz = Math.max(0, Math.min(size - 1, Math.round((z - origin[2]) / steps[2])));
    const px = new Uint8Array(size * size * 4);
    for (let iy = 0; iy < size; iy++)
      for (let ix = 0; ix < size; ix++) {
        const m = data[ix + size * (iy + size * iz)];
        const k = (ix + size * iy) * 4;
        if (m < 0) continue;
        // mistura a cor do limite mais perto (m = 0) com o verde (m ≥ 40 mm)
        const t = Math.min(1, m / 40);
        const [lr, lg, lb] = LIMIT_COLORS[limit[ix + size * (iy + size * iz)]];
        px[k] = Math.round(lr + (47 - lr) * t);
        px[k + 1] = Math.round(lg + (158 - lg) * t);
        px[k + 2] = Math.round(lb + (65 - lb) * t);
        px[k + 3] = 200;
      }
    const tex = new THREE.DataTexture(px, size, size, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const span = steps[0] * (size - 1);
    return { texture: tex, w: span, h: steps[1] * (size - 1), cx: origin[0] + span / 2, cy: origin[1] + (steps[1] * (size - 1)) / 2, zz: origin[2] + iz * steps[2] };
  }, [grid, z]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh position={[cx, cy, zz]} renderOrder={6}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} depthTest={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Marker({ pose, valid }: { pose: Pose; valid: boolean }) {
  return (
    <mesh position={[pose.x, pose.y, pose.z]} renderOrder={7}>
      <sphereGeometry args={[10, 24, 16]} />
      <meshBasicMaterial color={valid ? '#58d26b' : '#e5484d'} depthTest={false} transparent />
    </mesh>
  );
}

interface WorkspaceSceneProps {
  geometry: PlatformGeometry;
  grid: Grid | null;
  pose: Pose;
  valid: boolean;
  showSurface: boolean;
  showSlice: boolean;
  showRig: boolean;
  sliceZ: number;
  background: string;
}

export function WorkspaceScene({ geometry, grid, pose, valid, showSurface, showSlice, showRig, sliceZ, background }: WorkspaceSceneProps) {
  const getPose = useMemo(() => () => pose, [pose]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [pose, showSurface, showSlice, showRig, sliceZ, invalidate]);
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 4200, 9000]} />
      <OrbitControls makeDefault target={[0, 0, 350]} minDistance={600} maxDistance={4500} enableDamping maxPolarAngle={1.55} />
      <StudioLights high={false} />
      {showRig ? <PremiumRig geometry={geometry} getPose={getPose} /> : <PremiumBase geometry={geometry} />}
      <StudioStage color={background} high={false} />
      {grid && showSurface && <ReachSurface grid={grid} />}
      {grid && showSlice && <Slice grid={grid} z={sliceZ} />}
      <Marker pose={pose} valid={valid} />
    </>
  );
}
