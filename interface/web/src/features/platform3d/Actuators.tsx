import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { applyLegFrame } from './legFrame';
import { STATUS_EMISSIVE } from './materials';
import { PM } from './premium/assets';
import { ACT, ActuatorBody, ActuatorRod, UJoint } from './premium/PremiumParts';
import { cardanFrame, TopCardan, type CardanFrame } from './premium/TopJoint';
import type { SceneStore } from './sceneState';

/**
 * Um atuador do modelo da página (as mesmas peças do modelo premium): sistema local com
 * origem na junta da base, +Y ao longo da perna e +X para fora (lado do motor). A haste
 * desliza em Y; o cardã do tampo segue o tampo e a perna.
 */
function Actuator({ index, store }: { index: number; store: SceneStore }) {
  const group = useRef<THREE.Group>(null);
  const rod = useRef<THREE.Group>(null);
  const frame = useRef<CardanFrame | null>(null);
  // material próprio do tubo: o brilho (emissive) indica o estado do curso
  const tubeMat = useMemo(() => PM.aluminum.clone(), []);

  useFrame(() => {
    if (!group.current || !rod.current) return;
    const b = store.geometry.base_points[index];
    const p = store.solid.top[index];
    const L = applyLegFrame(group.current, b, p);
    rod.current.position.set(0, L - ACT.joint - ACT.rodLength / 2, 0);
    tubeMat.emissive.copy(STATUS_EMISSIVE[store.solid.status[index]]);
    frame.current = cardanFrame(p, b, store.solid.pose, frame.current ?? undefined);
  });

  return (
    <>
      <group ref={group}>
        <UJoint />
        <ActuatorBody index={index} highlighted={false} selected={false} tubeMaterial={tubeMat} />
        <group ref={rod}>
          <ActuatorRod />
        </group>
      </group>
      <TopCardan get={() => frame.current} />
    </>
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
