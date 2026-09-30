import { useLoader } from '@react-three/fiber';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { DIM } from './geometry';
import { MAT } from './materials';

/** Peça real do repositório: 3D-drawings-archives/kardan-joint/kardan-joint.stl (70 × 50 × 40 mm). */
export const BLUE_MOUNT_URL = '/models/kardan-joint.stl';

interface MountProps {
  x: number;
  y: number;
  /** direção do par de juntas (rad) */
  yaw: number;
}

function BoxMount({ x, y, yaw }: MountProps) {
  return (
    <mesh position={[x, y, -DIM.mountHeight / 2]} rotation={[0, 0, yaw]} material={MAT.bluePrint} castShadow>
      <boxGeometry args={[70, 50, DIM.mountHeight]} />
    </mesh>
  );
}

function StlMount({ x, y, yaw }: MountProps) {
  const raw = useLoader(STLLoader, BLUE_MOUNT_URL);
  const geometry = useMemo(() => {
    const g = raw.clone();
    // No STL a face com as porcas sextavadas é a grande inclinada (normal 0; 0,87; 0,5).
    // Na bancada ela fica apoiada na base: girar 240° em X a deixa virada para baixo,
    // e as duas faces do "V" (onde parafusam os cardãs) sobem inclinadas para o centro.
    g.rotateX((4 * Math.PI) / 3);
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    // centro das faces do V: 38,8 mm do lado de fora (y mín.), normal com 0,45 para dentro;
    // o centro da cruzeta fica ~15 mm à frente da face, sobre o ponto da junta (y = 0)
    const vFaceY = bb.min.y + 38.8 + 0.45 * 15;
    g.translate(-(bb.min.x + bb.max.x) / 2, -vFaceY, -DIM.mountHeight - bb.min.z);
    g.computeVertexNormals();
    return g;
  }, [raw]);
  return <mesh geometry={geometry} position={[x, y, 0]} rotation={[0, 0, yaw]} material={MAT.bluePrint} castShadow receiveShadow />;
}

/** Se o STL não carregar (arquivo ausente, offline sem cache), fica a caixa. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function BlueMount(props: MountProps) {
  const box = <BoxMount {...props} />;
  return (
    <Fallback fallback={box}>
      <Suspense fallback={box}>
        <StlMount {...props} />
      </Suspense>
    </Fallback>
  );
}
