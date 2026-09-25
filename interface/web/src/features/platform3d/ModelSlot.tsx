import { useGLTF } from '@react-three/drei';
import { useQuery } from '@tanstack/react-query';
import { Component, Suspense, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';

/**
 * Modelos opcionais feitos no Blender (public/models/<nome>.glb).
 * Só são carregados se estiverem listados em public/models/manifest.json;
 * sem o arquivo, a peça procedural (children) continua sendo desenhada.
 * Convenções de modelagem: interface/web/README.md → "Modelos 3D".
 */
export type ModelName = 'actuator-housing' | 'actuator-rod' | 'kardan-top' | 'top-plate';

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

function Glb({ url }: { url: string }) {
  // sem Draco: o decodificador viria de um CDN (quebraria offline). Meshopt vem empacotado.
  const { scene } = useGLTF(url, false, true);
  // cópia com materiais próprios: o brilho de estado de um atuador não pinta os outros
  const object = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = mesh.receiveShadow = true;
        const cloneTinted = (m: THREE.Material) => {
          const c = m.clone();
          c.userData.tint = true; // recebe o brilho de estado do curso (ver Actuators.tsx)
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneTinted) : cloneTinted(mesh.material);
      }
    });
    return root;
  }, [scene]);
  return <primitive object={object} />;
}

export function ModelSlot({ name, children }: { name: ModelName; children: ReactNode }) {
  const manifest = useModelManifest();
  if (!manifest.has(name)) return <>{children}</>;
  return (
    <LoadFallback fallback={children}>
      <Suspense fallback={children}>
        <Glb url={`/models/${name}.glb`} />
      </Suspense>
    </LoadFallback>
  );
}
