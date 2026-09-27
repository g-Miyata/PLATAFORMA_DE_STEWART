import { Html, Outlines, PerformanceMonitor } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { poseStatus, transformPoints } from '@/lib/kinematics';
import { PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry } from '@/lib/types';
import { useTelemetry } from '@/stores/telemetry';
import { DIM } from '@/features/platform3d/geometry';
import { GhostPlatform } from '@/features/platform3d/GhostPlatform';
import { applyLegFrame } from '@/features/platform3d/legFrame';
import { PM } from '@/features/platform3d/premium/assets';
import { PREMIUM_FLOOR_Z, PremiumBase } from '@/features/platform3d/premium/PremiumBase';
import { ACT, ActuatorBody, ActuatorRod, UJoint } from '@/features/platform3d/premium/PremiumParts';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import { Invalidator } from '@/features/platform3d/Invalidator';
import { CameraRig, type CameraView } from '@/features/platform3d/Scene';
import { poseState, type PoseState } from '@/features/platform3d/sceneState';
import { applyPose, usePlateGeometry } from '@/features/platform3d/TopPlate';
import { AXIS_LABEL, useBench } from './benchStore';
import { HeightArrow, PistonArrow, RotationRing } from './Gizmos';

export type Quality = 'alta' | 'leve';

type Hover = { kind: 'piston'; index: number } | { kind: 'handle' } | null;

const GLOW = {
  ok: new THREE.Color('#000000'),
  near: new THREE.Color('#b86b00'),
  invalid: new THREE.Color('#e0181e'),
};
const FLASH_MS = 900;

// ---------------- atuador interativo ----------------
function BenchActuator({ index, hovered, selected, onHover }: { index: number; hovered: boolean; selected: boolean; onHover: (h: Hover) => void }) {
  const group = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const arrow = useRef<THREE.Group>(null);
  const tubeMat = useMemo(() => PM.aluminum.clone(), []);
  const invalidate = useThree((s) => s.invalidate);

  useFrame(() => {
    if (!group.current || !rod.current || !top.current) return;
    const { geometry, pose, limit } = useBench.getState();
    const p = transformPoints(pose, geometry.platform_points_local)[index];
    const L = applyLegFrame(group.current, geometry.base_points[index], p);
    rod.current.position.set(0, L - ACT.joint - ACT.rodLength / 2, 0);
    top.current.position.set(0, L, 0);
    // seta no trecho visível da haste, do lado de dentro (oposto ao motor)
    arrow.current?.position.set(-ACT.tubeDepth / 2 - 42, (ACT.tubeStart + ACT.tubeLength + L - ACT.joint) / 2, 0);

    const flashing = limit && limit.piston === index && performance.now() - limit.at < FLASH_MS;
    if (flashing) {
      const k = 0.5 + 0.5 * Math.sin((performance.now() - limit.at) / 60);
      tubeMat.emissive.copy(GLOW.invalid).multiplyScalar(0.4 + k);
      invalidate(); // mantém a animação do pisca rodando no modo sob demanda
    } else {
      tubeMat.emissive.copy(GLOW[poseStatus(pose, geometry)[index]]);
    }
  });

  return (
    <group
      ref={group}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        onHover({ kind: 'piston', index });
      }}
      onPointerOut={() => onHover(null)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        useBench.getState().select({ kind: 'piston', index });
      }}
    >
      <UJoint />
      <ActuatorBody index={index} highlighted={hovered} selected={selected} tubeMaterial={tubeMat} />
      <group ref={rod}>
        <ActuatorRod />
      </group>
      <group ref={top}>
        <UJoint />
      </group>
      {selected && (
        <group ref={arrow}>
          <PistonArrow index={index} color={PISTON_COLORS[index]} />
        </group>
      )}
    </group>
  );
}

// ---------------- tampo + ponto central + gizmo da plataforma ----------------
const HANDLE_Z = DIM.topPlateGap + DIM.topPlateThickness + 22;

function BenchTop({ geometry, hovered, onHover }: { geometry: PlatformGeometry; hovered: boolean; onHover: (h: Hover) => void }) {
  const plateGroup = useRef<THREE.Group>(null);
  const gizmoGroup = useRef<THREE.Group>(null);
  const { plate, outline } = usePlateGeometry(geometry);
  const underside = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))), [outline]);
  const selection = useBench((s) => s.selection);
  const platformSelected = selection.kind === 'platform';

  useFrame(() => {
    const { pose } = useBench.getState();
    if (plateGroup.current) applyPose(plateGroup.current, pose);
    // gizmos alinhados ao mundo (não inclinam com o tampo)
    gizmoGroup.current?.position.set(pose.x, pose.y, pose.z + HANDLE_Z);
  });

  const center = () => {
    const { pose } = useBench.getState();
    return new THREE.Vector3(pose.x, pose.y, pose.z + HANDLE_Z);
  };

  return (
    <>
      <group ref={plateGroup}>
        <mesh geometry={plate} material={PM.powderBlack} position={[0, 0, DIM.topPlateGap]} castShadow receiveShadow />
        <mesh geometry={underside} material={PM.plateUnderside} position={[0, 0, DIM.topPlateGap - 0.3]} />
        {geometry.platform_points_local.map(([x, y], i) => (
          <mesh key={i} position={[x, y, DIM.topPlateGap / 2 + 5]} material={PM.aluminumMatte} castShadow>
            <boxGeometry args={[30, 30, DIM.topPlateGap - 10]} />
          </mesh>
        ))}
        {/* ponto central: clique seleciona a plataforma e alterna Z → roll → pitch → yaw */}
        <mesh
          position={[0, 0, HANDLE_Z]}
          material={PM.handle}
          castShadow
          onPointerOver={(e: ThreeEvent<PointerEvent>) => {
            e.stopPropagation();
            onHover({ kind: 'handle' });
          }}
          onPointerOut={() => onHover(null)}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            useBench.getState().cycleAxis();
          }}
          scale={hovered || platformSelected ? 1.18 : 1}
        >
          <sphereGeometry args={[20, 48, 32]} />
          {(hovered || platformSelected) && <Outlines thickness={3} color={platformSelected ? '#2f9e41' : '#ffffff'} />}
        </mesh>
      </group>

      <group ref={gizmoGroup}>
        {platformSelected && (
          <>
            {selection.axis === 'z' ? <HeightArrow center={center} /> : <RotationRing axis={selection.axis} center={center} />}
            <Html position={[0, 0, 60]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
              <span className="whitespace-nowrap rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-semibold text-fg shadow">
                {AXIS_LABEL[selection.axis]} · clique no ponto para trocar
              </span>
            </Html>
          </>
        )}
      </group>
    </>
  );
}

// ---------------- fantasma com a pose medida ----------------
/** Fonte do fantasma: a pose medida mais recente (lida pelo GhostPlatform em useFrame). */
class LiveGhostSource {
  ghost: PoseState | null = null;
  readonly geometry: PlatformGeometry;
  constructor(geometry: PlatformGeometry) {
    this.geometry = geometry;
  }
  update() {
    const t = useTelemetry.getState().telemetry;
    const fresh = t?.pose_live && Date.now() / 1000 - t.ts < 1.5;
    this.ghost = fresh && t?.pose_live ? poseState(t.pose_live, this.geometry) : null;
  }
}

function LiveGhost({ geometry }: { geometry: PlatformGeometry }) {
  const source = useMemo(() => new LiveGhostSource(geometry), [geometry]);
  useFrame(() => source.update());
  return <GhostPlatform geometry={geometry} store={source} />;
}

// re-renderiza (frameloop sob demanda) quando a edição ou a telemetria mudam
const INVALIDATE_ON = [useBench, useTelemetry];

// ---------------- cena ----------------
interface BenchSceneProps {
  geometry: PlatformGeometry;
  quality: Quality;
  onDecline: () => void;
  showReal: boolean;
  background: string;
  view: CameraView;
  viewNonce: number;
}

export function BenchScene({ geometry, quality, onDecline, showReal, background, view, viewNonce }: BenchSceneProps) {
  const [hover, setHover] = useState<Hover>(null);
  const selection = useBench((s) => s.selection);
  const dragging = useBench((s) => s.dragging);
  const high = quality === 'alta';

  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 4200, 9000]} />
      <Invalidator stores={INVALIDATE_ON} />
      <PerformanceMonitor onDecline={onDecline} />
      <CameraRig view={view} nonce={viewNonce} enabled={!dragging} distance={1.3} />

      <StudioLights high={high} />

      <PremiumBase geometry={geometry} />
      {PISTON_COLORS.map((_, i) => (
        <BenchActuator
          key={i}
          index={i}
          hovered={hover?.kind === 'piston' && hover.index === i}
          selected={selection.kind === 'piston' && selection.index === i}
          onHover={setHover}
        />
      ))}
      <BenchTop geometry={geometry} hovered={hover?.kind === 'handle'} onHover={setHover} />
      {showReal && <LiveGhost geometry={geometry} />}

      <StudioStage color={background} high={high} frames={1} />

      {/* clique no vazio limpa a seleção */}
      <mesh
        position={[0, 0, PREMIUM_FLOOR_Z - 2]}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (e.delta < 4) useBench.getState().select({ kind: 'none' });
        }}
      >
        <circleGeometry args={[6000, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {high && (
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={90} intensity={2.4} distanceFalloff={0.7} halfRes />
          <Bloom luminanceThreshold={0.95} intensity={0.45} mipmapBlur />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <SMAA />
          <Vignette offset={0.3} darkness={0.35} />
        </EffectComposer>
      )}
    </>
  );
}
