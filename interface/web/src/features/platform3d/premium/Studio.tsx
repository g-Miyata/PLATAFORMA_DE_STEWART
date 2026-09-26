import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { PREMIUM_FLOOR_Z } from './PremiumBase';

/**
 * Iluminação de estúdio do modelo premium (Bancada 3D e página inicial): luz
 * principal com sombra, preenchimento e softboxes gerados localmente para os
 * reflexos do alumínio e do cromo (sem HDR externo, funciona offline).
 */
export function StudioLights({ high }: { high: boolean }) {
  return (
    <>
      <ambientLight intensity={0.25} />
      <hemisphereLight position={[0, 0, 1000]} args={['#ffffff', '#30343a', 0.45]} />
      <directionalLight
        castShadow
        position={[900, -1100, 2000]}
        intensity={2.2}
        shadow-mapSize={high ? [4096, 4096] : [1024, 1024]}
        shadow-camera-left={-900}
        shadow-camera-right={900}
        shadow-camera-top={900}
        shadow-camera-bottom={-900}
        shadow-camera-near={200}
        shadow-camera-far={5000}
        shadow-bias={-0.0003}
        shadow-normalBias={0.6}
      />
      <directionalLight position={[-1200, 900, 700]} intensity={0.55} color="#dfe8ff" />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3.2} position={[0, 0, 1500]} scale={[2200, 1400, 1]} />
        <Lightformer form="rect" intensity={2} position={[1600, -500, 500]} rotation={[0, Math.PI / 2, 0]} scale={[1200, 300, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-1600, 600, 400]} rotation={[0, -Math.PI / 2, 0]} scale={[1200, 300, 1]} />
        <Lightformer form="ring" intensity={1.2} position={[0, 1700, 600]} rotation={[Math.PI / 2, 0, 0]} scale={500} color="#cfe0ff" />
        {/* preenchimento atrás da câmera e rebatida do chão: o cromo nunca reflete preto */}
        <Lightformer form="rect" intensity={1.6} position={[1700, -2000, 900]} scale={[2400, 1200, 1]} />
        <Lightformer form="rect" intensity={0.7} position={[0, 0, -900]} rotation={[Math.PI, 0, 0]} scale={[3000, 3000, 1]} color="#b8c0c8" />
      </Environment>
    </>
  );
}

/** Piso circular com sombra de contato sob a bancada. */
export function StudioStage({ color, high, frames }: { color: string; high: boolean; frames?: number }) {
  return (
    <group position={[0, 0, PREMIUM_FLOOR_Z]}>
      <mesh receiveShadow position={[0, 0, -1]}>
        {/* grande o bastante para a borda sumir na névoa (sem linha de horizonte dura) */}
        <circleGeometry args={[14000, 128]} />
        <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
      </mesh>
      <ContactShadows rotation={[Math.PI / 2, 0, 0]} scale={2400} far={1000} blur={2.6} opacity={0.55} resolution={high ? 1024 : 512} frames={frames} />
    </group>
  );
}
