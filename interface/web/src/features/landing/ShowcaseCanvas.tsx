import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas } from '@/components/Canvas3D';
import { zeroPose } from '@/lib/kinematics';
import type { PlatformGeometry, Pose } from '@/lib/types';
import { PremiumRig } from '@/features/platform3d/premium/PremiumRig';
import { StudioLights, StudioStage } from '@/features/platform3d/premium/Studio';
import { showcasePose } from './showcase';

/** Estado da demonstração fora do React (lido a cada frame). */
class ShowcaseClock {
  t = 0;
  pose: Pose;
  moveIndex = 0;
  constructor(homeZ: number) {
    this.pose = zeroPose(homeZ);
  }
  advance(dt: number, homeZ: number) {
    this.t += Math.min(dt, 0.1);
    const r = showcasePose(this.t, homeZ);
    this.pose = r.pose;
    this.moveIndex = r.index;
  }
}

function Choreography({ clock, geometry, playing, onMove }: { clock: ShowcaseClock; geometry: PlatformGeometry; playing: boolean; onMove: (i: number) => void }) {
  const last = useRef(-1);
  useFrame((_, dt) => {
    if (!playing) return;
    clock.advance(dt, geometry.home_z);
    if (clock.moveIndex !== last.current) {
      last.current = clock.moveIndex;
      onMove(clock.moveIndex);
    }
  });
  return null;
}

interface ShowcaseCanvasProps {
  geometry: PlatformGeometry;
  playing: boolean;
  background: string;
  onMove: (index: number) => void;
}

/** Modelo premium em movimento para a página inicial (órbita lenta, sem zoom para não prender a rolagem). */
export function ShowcaseCanvas({ geometry, playing, background, onMove }: ShowcaseCanvasProps) {
  const [clock] = useState(() => new ShowcaseClock(geometry.home_z));
  const [high, setHigh] = useState(true);
  const getPose = useMemo(() => () => clock.pose, [clock]);

  return (
    <Canvas
      shadows
      frameloop={playing ? 'always' : 'demand'}
      dpr={high ? [1, 2] : [1, 1.25]}
      camera={{ position: [1750, -1900, 1150], up: [0, 0, 1], fov: 30, near: 5, far: 20000 }}
      gl={{ antialias: !high, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.05 }}
    >
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, 4200, 9000]} />
      <PerformanceMonitor onDecline={() => setHigh(false)} />
      <Choreography clock={clock} geometry={geometry} playing={playing} onMove={onMove} />
      <OrbitControls
        makeDefault
        target={[0, 0, 110]}
        enableZoom={false}
        enablePan={false}
        autoRotate={playing}
        autoRotateSpeed={0.55}
        enableDamping
        minPolarAngle={0.5}
        maxPolarAngle={1.45}
      />
      <StudioLights high={high} />
      <PremiumRig geometry={geometry} getPose={getPose} />
      <StudioStage color={background} high={high} />
      {high && (
        <EffectComposer multisampling={0}>
          <N8AO aoRadius={90} intensity={2.2} distanceFalloff={0.7} halfRes />
          <ToneMapping mode={ToneMappingMode.AGX} />
          <SMAA />
        </EffectComposer>
      )}
    </Canvas>
  );
}
