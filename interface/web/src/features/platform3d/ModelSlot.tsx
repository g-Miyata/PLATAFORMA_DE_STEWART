import { useGLTF } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Modelos opcionais feitos no Blender (public/models/<nome>.glb).
 * Só são carregados se estiverem listados em public/models/manifest.json;
 * sem o arquivo, a peça procedural (children) continua sendo desenhada.
 * Convenções de modelagem: interface/web/README.md → "Modelos 3D".
 */
export type ModelName =
  | 'actuator-housing'
  | 'actuator-rod'
  | 'kardan-top'
  | 'top-plate'
  | 'driver-board'
  | 'power-supply'
  | 'breaker'
  | 'terminal-strip'
  | 'terminal-strip-blue'
  | 'db37-female'
  | 'estop';

function useModelManifest(): Set<string> {
  const { data } = useQuery({
    queryKey: ['model-manifest'],
    queryFn: async () => {
      const res = await fetch('/models/manifest.json');
      if (!res.ok) return [] as string[];
      const json = (await res.json()) as { models?: string[] };
      return json.models ?? [];
    },
    staleTime: Infinity,
    retry: false,
  });
  return useMemo(() => new Set(data ?? []), [data]);
}

class LoadFallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Junta as peças do .glb por material (um modelo do Blender tem dezenas de
 * peças; seis atuadores viravam centenas de chamadas de desenho). Só posição e
 * normal são mantidas: as peças não usam textura.
 */
function mergeByMaterial(root: THREE.Object3D, overrides: MaterialOverrides | undefined) {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const g = mesh.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(mesh.matrixWorld);
    const key = mesh.material.name || mesh.material.uuid;
    const bucket = buckets.get(key) ?? { material: mesh.material, geometries: [] };
    bucket.geometries.push(g);
    buckets.set(key, bucket);
  });
  const group = new THREE.Group();
  for (const [key, { material, geometries }] of buckets) {
    const merged = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const override = overrides?.[key];
    let mat = override;
    if (!mat) {
      mat = material.clone();
      mat.userData.tint = true; // recebe o brilho de estado do curso (ver Actuators.tsx)
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = key;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function Glb({ url, materials, zUp }: { url: string; materials?: MaterialOverrides; zUp?: boolean }) {
  // sem Draco: o decodificador viria de um CDN (quebraria offline). Meshopt vem empacotado.
  const { scene } = useGLTF(url, false, true);
  // cópia com materiais próprios: o brilho de estado de um atuador não pinta os outros
  const object = useMemo(() => mergeByMaterial(scene, materials), [scene, materials]);
  // glTF é Y para cima; zUp desfaz a conversão para peças montadas no plano XY (bandeja)
  return zUp ? (
    <group rotation={[Math.PI / 2, 0, 0]}>
      <primitive object={object} />
    </group>
  ) : (
    <primitive object={object} />
  );
}

/** Material do .glb (pelo nome dado no Blender) → material do app que o substitui. */
export type MaterialOverrides = Readonly<Record<string, THREE.Material>>;

export function ModelSlot({
  name,
  materials,
  zUp,
  children,
}: {
  name: ModelName;
  /** troca materiais do .glb por materiais controlados pelo app (precisa ser estável) */
  materials?: MaterialOverrides;
  /** o modelo foi feito com Z para cima no Blender e vai num grupo Z para cima */
  zUp?: boolean;
  children: ReactNode;
}) {
  const manifest = useModelManifest();
  if (!manifest.has(name)) return <>{children}</>;
  return (
    <LoadFallback fallback={children}>
      <Suspense fallback={children}>
        <Glb url={`/models/${name}.glb`} materials={materials} zUp={zUp} />
      </Suspense>
    </LoadFallback>
  );
}
