import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { legStatus, transformPoints } from '@/lib/kinematics';
import { PISTON_COLORS } from '@/lib/pistons';
import type { PlatformGeometry, Pose } from '@/lib/types';
import { DIM } from '../geometry';
import { applyLegFrame } from '../legFrame';
import { STATUS_EMISSIVE } from '../materials';
import { applyPose, usePlateGeometry } from '../TopPlate';
import { PM } from './assets';
import { PremiumBase } from './PremiumBase';
import { ACT, ActuatorBody, ActuatorRod, UJoint } from './PremiumParts';

type PoseSource = () => Pose;

function RigActuator({ index, geometry, getPose }: { index: number; geometry: PlatformGeometry; getPose: PoseSource }) {
  const group = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const top = useRef<THREE.Group>(null);
  const tubeMat = useMemo(() => PM.aluminum.clone(), []);

  useFrame(() => {
    if (!group.current || !rod.current || !top.current) return;
    const p = transformPoints(getPose(), geometry.platform_points_local)[index];
    const L = applyLegFrame(group.current, geometry.base_points[index], p);
    rod.current.position.set(0, L - ACT.joint - ACT.rodLength / 2, 0);
    top.current.position.set(0, L, 0);
    tubeMat.emissive.copy(STATUS_EMISSIVE[legStatus(L, geometry.stroke_min, geometry.stroke_max)]);
  });

  return (
    <group ref={group}>
      <UJoint />
      <ActuatorBody index={index} highlighted={false} selected={false} tubeMaterial={tubeMat} />
      <group ref={rod}>
        <ActuatorRod />
      </group>
      <group ref={top}>
        <UJoint />
      </group>
    </group>
  );
}

function RigTop({ geometry, getPose }: { geometry: PlatformGeometry; getPose: PoseSource }) {
  const group = useRef<THREE.Group>(null);
  const { plate, outline } = usePlateGeometry(geometry);
  const underside = useMemo(() => new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)))), [outline]);
  useFrame(() => {
    if (group.current) applyPose(group.current, getPose());
  });
  return (
    <group ref={group}>
      <mesh geometry={plate} material={PM.powderBlack} position={[0, 0, DIM.topPlateGap]} castShadow receiveShadow />
      <mesh geometry={underside} material={PM.plateUnderside} position={[0, 0, DIM.topPlateGap - 0.3]} />
      {geometry.platform_points_local.map(([x, y], i) => (
        <mesh key={i} position={[x, y, DIM.topPlateGap / 2 + 5]} material={PM.aluminumMatte} castShadow>
          <boxGeometry args={[30, 30, DIM.topPlateGap - 10]} />
        </mesh>
      ))}
    </group>
  );
}

/** Bancada premium completa (sem interação), movida pela pose de `getPose` a cada frame. */
export function PremiumRig({ geometry, getPose }: { geometry: PlatformGeometry; getPose: PoseSource }) {
  return (
    <group>
      <PremiumBase geometry={geometry} />
      {PISTON_COLORS.map((_, i) => (
        <RigActuator key={i} index={i} geometry={geometry} getPose={getPose} />
      ))}
      <RigTop geometry={geometry} getPose={getPose} />
    </group>
  );
}
