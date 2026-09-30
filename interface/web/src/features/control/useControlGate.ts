import { useEffect, useRef } from 'react';
import { useConnection } from '@/stores/connection';
import { useUi } from '@/stores/ui';

/** Pode mandar comandos? (serial aberta: hardware real ou simulador) */
export function useCanCommand() {
  return useConnection((s) => s.backendOnline !== false && s.serial.connected);
}

/**
 * Desliga um controle ao vivo (joystick, IMU, aplicar automático) quando a
 * parada de emergência é acionada ou a serial cai.
 */
export function useAutoDisable(enabled: boolean, disable: () => void) {
  const estopCount = useUi((s) => s.estopCount);
  const connected = useCanCommand();
  const disableRef = useRef(disable);
  useEffect(() => {
    disableRef.current = disable;
  });
  const first = useRef(estopCount);
  useEffect(() => {
    if (estopCount !== first.current && enabled) disableRef.current();
    first.current = estopCount;
  }, [estopCount, enabled]);
  useEffect(() => {
    if (!connected && enabled) disableRef.current();
  }, [connected, enabled]);
}
