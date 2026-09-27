import { Canvas as FiberCanvas, type CanvasProps } from '@react-three/fiber';
import { Component, type ReactNode } from 'react';

let webgl: boolean | null = null;

/** O navegador cria um contexto WebGL? (consultado uma vez) */
export function webglAvailable() {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webgl = false;
  }
  return webgl;
}

function Fallback() {
  return (
    <div role="note" className="flex h-full min-h-24 w-full items-center justify-center p-4 text-center text-sm text-muted">
      Este navegador não conseguiu abrir o 3D (WebGL), então o modelo não aparece aqui. O resto da página funciona normalmente.
    </div>
  );
}

/** Se o WebGL falhar no meio (contexto recusado, driver), mostra o aviso no lugar do 3D. */
class WebglBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('3D indisponível:', err);
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

/**
 * Canvas do react-three-fiber que não derruba a página: sem WebGL (PC sem aceleração,
 * navegador bloqueando) aparece um aviso no lugar do modelo 3D.
 */
export function Canvas(props: CanvasProps) {
  if (!webglAvailable()) return <Fallback />;
  return (
    <WebglBoundary>
      <FiberCanvas {...props} />
    </WebglBoundary>
  );
}
