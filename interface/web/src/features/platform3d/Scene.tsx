import { ContactShadows, Environment, Grid, Lightformer, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ComponentRef } from 'react';
import type { PlatformGeometry } from '@/lib/types';
import { Actuators } from './Actuators';
import { BaseFrame } from './BaseFrame';
import { FLOOR_Z } from './geometry';
import { GhostPlatform } from './GhostPlatform';
import type { SceneStore } from './sceneState';
import { TopPlate } from './TopPlate';

/** Avança o estado da cena uma vez por frame (sólido = medido, fantasma = comandado). */
function FrameDriver({ store }: { store: SceneStore }) {
  useFrame((_, dt) => store.step(dt));
  return null;
}

export type CameraView = 'iso' | 'front' | 'side' | 'top';

export const CAMERA_VIEWS: Record<CameraView, { label: string; position: [number, number, number] }> = {
  iso: { label: 'Isométrica', position: [1150, -1350, 900] },
  front: { label: 'Frente (+X)', position: [1900, 0, 350] },
  side: { label: 'Lateral (−Y)', position: [0, -1900, 350] },
  top: { label: 'Topo', position: [0, -1, 2400] },
};

const LOOK_AT: [number, number, number] = [0, 0, 140];

function CameraRig({ view, nonce }: { view: CameraView; nonce: number }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...CAMERA_VIEWS[view].position);
    controls.current?.target.set(...LOOK_AT);
    controls.current?.update();
  }, [camera, view, nonce]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={LOOK_AT}
      enableDamping
      dampingFactor={0.12}
      minDistance={500}
      maxDistance={5000}
    />
  );
}

interface SceneProps {
  geometry: PlatformGeometry;
  store: SceneStore;
  background: string;
  gridColor: string;
  view: CameraView;
  viewNonce: number;
}

export function Scene({ geometry, store, background, gridColor, view, viewNonce }: SceneProps) {
  return (
    <>
      <color attach="background" args={[background]} />
      <FrameDriver store={store} />
      <CameraRig view={view} nonce={viewNonce} />

      <ambientLight intensity={0.45} />
      <hemisphereLight position={[0, 0, 1000]} args={['#ffffff', '#3a3f45', 0.55]} />
      <directionalLight
        castShadow
        position={[700, -900, 1700]}
        intensity={1.7}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-900}
        shadow-camera-right={900}
        shadow-camera-top={900}
        shadow-camera-bottom={-900}
        shadow-camera-near={100}
        shadow-camera-far={5000}
        shadow-bias={-0.0004}
      />
      {/* Reflexos do metal sem baixar HDR: ambiente gerado localmente (funciona offline) */}
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 0, 1200]} scale={[1600, 1600, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[1400, -600, 400]} rotation={[0, Math.PI / 2, 0]} scale={[900, 500, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-1400, 700, 300]} rotation={[0, -Math.PI / 2, 0]} scale={[900, 500, 1]} />
      </Environment>

      <BaseFrame geometry={geometry} />
      <Actuators store={store} />
      <TopPlate geometry={geometry} store={store} />
      <GhostPlatform geometry={geometry} store={store} />

      <group position={[0, 0, FLOOR_Z]}>
        <ContactShadows rotation={[Math.PI / 2, 0, 0]} scale={2200} far={900} blur={2.2} opacity={0.45} resolution={512} />
        <Grid
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, 0, -0.5]}
          cellSize={50}
          sectionSize={250}
          cellColor={gridColor}
          sectionColor={gridColor}
          cellThickness={0.6}
          sectionThickness={1.1}
          fadeDistance={3200}
          fadeStrength={1.5}
          infiniteGrid
        />
      </group>
    </>
  );
}
