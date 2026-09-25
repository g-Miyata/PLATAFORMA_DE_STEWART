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
  // centraliza em XY e apoia o topo em z = 0 (altura das juntas da base)
  const geometry = useMemo(() => {
    const g = raw.clone();
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.max.z);
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
