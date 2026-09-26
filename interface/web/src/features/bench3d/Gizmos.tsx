import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useState } from 'react';
import * as THREE from 'three';
import { transformPoints } from '@/lib/kinematics';
import { axisDragDelta, rotationDragDelta, type Vec2 } from './dragMath';
import { useBench } from './benchStore';

const tmp = new THREE.Vector3();

/** Projeta um ponto do mundo em pixels do canvas (origem no canto superior esquerdo). */
function toScreen(p: THREE.Vector3, camera: THREE.Camera, rect: DOMRect): Vec2 {
  tmp.copy(p).project(camera);
  return [((tmp.x + 1) / 2) * rect.width, ((1 - tmp.y) / 2) * rect.height];
}

type DragKind =
  | { type: 'axis'; axis: () => { origin: THREE.Vector3; dir: THREE.Vector3 }; onDelta: (mm: number) => void }
  | { type: 'rotate'; axis: () => { origin: THREE.Vector3; dir: THREE.Vector3 }; onDelta: (deg: number) => void };

function setCursor(canvas: HTMLCanvasElement, cursor: string) {
  canvas.style.cursor = cursor;
}

/**
 * Arraste com listeners na janela: continua funcionando quando o ponteiro sai do
 * gizmo, e a órbita da câmera fica desligada enquanto dura. Função de módulo (fora
 * do render): guarda o último ponto do ponteiro e muda o cursor do canvas.
 */
function startDrag(e: ThreeEvent<PointerEvent>, camera: THREE.Camera, canvas: HTMLCanvasElement, kind: DragKind) {
  e.stopPropagation();
  const bench = useBench.getState();
  bench.checkpoint();
  bench.setDragging(true);
  const rect = canvas.getBoundingClientRect();
  let last: Vec2 = [e.nativeEvent.clientX - rect.left, e.nativeEvent.clientY - rect.top];
  setCursor(canvas, 'grabbing');

  const move = (ev: PointerEvent) => {
    const now: Vec2 = [ev.clientX - rect.left, ev.clientY - rect.top];
    const { origin, dir } = kind.axis();
    const a = toScreen(origin, camera, rect);
    if (kind.type === 'axis') {
      const b = toScreen(origin.clone().addScaledVector(dir, 100), camera, rect);
      kind.onDelta(axisDragDelta(a, b, 100, [now[0] - last[0], now[1] - last[1]]));
    } else {
      const toCam = camera.position.clone().sub(origin);
      kind.onDelta(rotationDragDelta(a, last, now, dir.dot(toCam) >= 0 ? 1 : -1));
    }
    last = now;
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    setCursor(canvas, '');
    useBench.getState().setDragging(false);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function useDrag(kind: DragKind) {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  return (e: ThreeEvent<PointerEvent>) => startDrag(e, camera, canvas, kind);
}

function useHoverCursor() {
  const canvas = useThree((s) => s.gl.domElement);
  const [hover, setHover] = useState(false);
  return {
    hover,
    bind: {
      onPointerOver: (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover(true);
        if (!useBench.getState().dragging) setCursor(canvas, 'grab');
      },
      onPointerOut: () => {
        setHover(false);
        if (!useBench.getState().dragging) setCursor(canvas, '');
      },
    },
  };
}

const hitMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/** Seta dupla ao longo do +Y local (cima/baixo), com área de toque generosa. */
export function DoubleArrow({ color, length = 150, onPointerDown }: { color: string; length?: number; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const { hover, bind } = useHoverCursor();
  const half = length / 2;
  const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover ? 1.6 : 0.5} roughness={0.3} />;
  return (
    <group scale={hover ? 1.12 : 1}>
      <mesh>
        <cylinderGeometry args={[4, 4, length - 40, 16]} />
        {mat}
      </mesh>
      <mesh position={[0, half - 12, 0]}>
        <coneGeometry args={[12, 26, 24]} />
        {mat}
      </mesh>
      <mesh position={[0, -half + 12, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[12, 26, 24]} />
        {mat}
      </mesh>
      <mesh material={hitMaterial} onPointerDown={onPointerDown} {...bind}>
        <cylinderGeometry args={[24, 24, length + 10, 12]} />
      </mesh>
    </group>
  );
}

/** Seta de arraste de um pistão: move ao longo do eixo da perna (em mm). */
export function PistonArrow({ index, color }: { index: number; color: string }) {
  const onPointerDown = useDrag({
    type: 'axis',
    axis: () => {
      const { geometry, lengths } = useBench.getState();
      const top = pistonTop(index);
      const b = geometry.base_points[index];
      const origin = new THREE.Vector3(...b);
      const dir = new THREE.Vector3(top[0] - b[0], top[1] - b[1], top[2] - b[2]).normalize();
      return { origin: origin.addScaledVector(dir, lengths[index] * 0.7), dir };
    },
    onDelta: (mm) => {
      const s = useBench.getState();
      s.setPistonLength(index, s.lengths[index] + mm);
    },
  });
  return <DoubleArrow color={color} length={170} onPointerDown={onPointerDown} />;
}

function pistonTop(index: number) {
  const { geometry, pose } = useBench.getState();
  return transformPoints(pose, geometry.platform_points_local)[index];
}

const AXIS_DIR: Record<'roll' | 'pitch' | 'yaw', THREE.Vector3> = {
  roll: new THREE.Vector3(1, 0, 0),
  pitch: new THREE.Vector3(0, 1, 0),
  yaw: new THREE.Vector3(0, 0, 1),
};
const RING_ROT: Record<'roll' | 'pitch' | 'yaw', [number, number, number]> = {
  roll: [0, Math.PI / 2, 0],
  pitch: [Math.PI / 2, 0, 0],
  yaw: [0, 0, 0],
};
export const AXIS_COLOR = { z: '#2f9e41', roll: '#ef4444', pitch: '#22c55e', yaw: '#3b82f6' } as const;

/** Anel de rotação em torno de X (roll), Y (pitch) ou Z (yaw), alinhado ao mundo. */
export function RotationRing({ axis, center }: { axis: 'roll' | 'pitch' | 'yaw'; center: () => THREE.Vector3 }) {
  const { hover, bind } = useHoverCursor();
  const color = AXIS_COLOR[axis];
  const mat = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={hover ? 1.8 : 0.6} roughness={0.3} />;
  const onPointerDown = useDrag({
    type: 'rotate',
    axis: () => ({ origin: center(), dir: AXIS_DIR[axis] }),
    onDelta: (deg) => {
      const s = useBench.getState();
      s.setPose({ ...s.pose, [axis]: s.pose[axis] + deg });
    },
  });
  const R = 360;
  return (
    <group rotation={RING_ROT[axis]}>
      <mesh>
        <torusGeometry args={[R, hover ? 5 : 3.5, 12, 160]} />
        {mat}
      </mesh>
      {/* setas curvas indicando o sentido */}
      {[0, Math.PI].map((a) => (
        <mesh key={a} position={[Math.cos(a) * R, Math.sin(a) * R, 0]} rotation={[0, 0, a]}>
          <coneGeometry args={[14, 34, 20]} />
          {mat}
        </mesh>
      ))}
      <mesh material={hitMaterial} onPointerDown={onPointerDown} {...bind}>
        <torusGeometry args={[R, 26, 8, 80]} />
      </mesh>
    </group>
  );
}

/** Seta vertical para arrastar a altura Z da plataforma. */
export function HeightArrow({ center }: { center: () => THREE.Vector3 }) {
  const onPointerDown = useDrag({
    type: 'axis',
    axis: () => ({ origin: center(), dir: new THREE.Vector3(0, 0, 1) }),
    onDelta: (mm) => {
      const s = useBench.getState();
      s.setPose({ ...s.pose, z: s.pose.z + mm });
    },
  });
  return (
    <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 110]}>
      <DoubleArrow color={AXIS_COLOR.z} length={200} onPointerDown={onPointerDown} />
    </group>
  );
}
