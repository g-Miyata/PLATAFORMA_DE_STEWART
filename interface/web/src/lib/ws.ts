// Conexão WebSocket única com o backend (/ws/telemetry).
// Como o app é uma SPA, ela sobrevive à troca de páginas: substitui as seis
// implementações de reconexão do frontend antigo.
import { useConnection } from '@/stores/connection';
import { useTelemetry } from '@/stores/telemetry';
import type { WsMessage } from './types';

const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

export function telemetryUrl(loc: Pick<Location, 'protocol' | 'host'> = window.location): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws/telemetry`;
}

export function dispatchMessage(msg: WsMessage) {
  const telemetry = useTelemetry.getState();
  switch (msg.type) {
    case 'telemetry':
    case 'telemetry_mpu':
    case 'telemetry_bno085':
      telemetry.onTelemetry(msg);
      break;
    case 'motion_tick':
      telemetry.onMotionTick(msg);
      break;
    case 'raw':
      telemetry.pushLog(msg.parse_error ? 'error' : 'rx', msg.raw);
      break;
  }
}

export class TelemetrySocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    if (this.ws) {
      // Solta os handlers antes de fechar: o onclose do socket antigo não pode
      // agendar reconexão por cima de um socket novo.
      this.ws.onopen = this.ws.onclose = this.ws.onmessage = this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    useConnection.getState().setWsConnected(false);
  }

  private connect() {
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      useConnection.getState().setWsConnected(true);
    };
    ws.onmessage = (ev) => {
      try {
        dispatchMessage(JSON.parse(ev.data) as WsMessage);
      } catch {
        /* mensagem malformada: ignora */
      }
    };
    ws.onclose = () => {
      useConnection.getState().setWsConnected(false);
      if (this.ws === ws) this.ws = null;
      this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const delay = Math.min(MAX_DELAY_MS, MIN_DELAY_MS * 2 ** this.attempt);
    this.attempt += 1;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}
