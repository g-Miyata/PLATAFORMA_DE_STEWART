import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { PremiumRig } from '@/features/platform3d/premium/PremiumRig';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import type { PlatformGeometry, Pose } from '@/lib/types';

function FrameHook({ onFrame }: { onFrame: (dt: number) => void }) {
  useFrame((_, dt) => onFrame(Math.min(dt, 0.1)));
  return null;
}

interface PresentationCanvasProps {
  geometry: PlatformGeometry;
  getPose: () => Pose;
  background: string;
  onFrame?: (dt: number) => void;
  autoRotate?: boolean;
  /** pós-processamento (oclusão de ambiente); desligado na aula para as setas ficarem nítidas */
  effects?: boolean;
  children?: ReactNode;
}

/** Bancada premium em tela cheia para apresentação e aula. */
export function PresentationCanvas({ geometry, getPose, background, onFrame, autoRotate = false, effects = true, children }: PresentationCanvasProps) {
  const [high, setHigh] = useState(true);
  return (
    <Canvas
      shadows
      dpr={high ? [1, 2] : [1, 1.25]}
      camera={{ position: [1650, -1900, 1150], up: [0, 0, 1], fov: 30, near: 5, far: 20000 }}
      gl={{ antialias: !(high && effects), toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}
    >
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 4200, 9000]} />
      <PerformanceMonitor onDecline={() => setHigh(false)} />
      {onFrame && <FrameHook onFrame={onFrame} />}
      <OrbitControls
        makeDefault
        target={[0, 0, 150]}
        enablePan={false}
        minDistance={700}
        maxDistance={4200}
        autoRotate={autoRotate}
        autoRotateSpeed={0.45}
        enableDamping
        maxPolarAngle={1.5}
      />
      <StudioLights high={high} />
      <PremiumRig geometry={geometry} getPose={getPose} />
      <StudioStage color={background} high={high} />
      {children}
      {high && effects && (
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={90} intensity={2.2} distanceFalloff={0.7} halfRes />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
  );
}
