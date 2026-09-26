import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

type Subscribable = { subscribe: (listener: () => void) => () => void };

/** Com frameloop="demand", pede um novo quadro sempre que algum dos stores muda. */
export function Invalidator({ stores }: { stores: Subscribable[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const unsubs = stores.map((s) => s.subscribe(() => invalidate()));
    return () => unsubs.forEach((u) => u());
  }, [invalidate, stores]);
  return null;
}
