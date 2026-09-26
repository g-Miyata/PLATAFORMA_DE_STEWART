import { create } from 'zustand';

/**
 * Captura da janela do FlightGear pelo navegador (a API de "compartilhar tela"):
 * 30 a 60 fps na resolução real da janela, sem o custo do MJPEG no FlightGear.
 * Fica fora do componente para sobreviver à troca entre as telas de voo.
 */
interface FgCaptureState {
  stream: MediaStream | null;
  start: () => Promise<'ok' | 'cancelled' | 'unsupported'>;
  stop: () => void;
}

export const captureSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

export const useFgCapture = create<FgCaptureState>((set, get) => ({
  stream: null,
  start: async () => {
    if (!captureSupported()) return 'unsupported';
    get().stop();
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60 }, displaySurface: 'window' },
        audio: false,
        // opções do Chrome/Edge: sugere janelas e esconde a aba atual da lista
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      } as DisplayMediaStreamOptions);
      // "Parar de compartilhar" do navegador volta para a imagem do servidor
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (get().stream === stream) set({ stream: null });
      });
      set({ stream });
      return 'ok';
    } catch (err) {
      if ((err as DOMException).name === 'NotAllowedError' || (err as DOMException).name === 'AbortError') return 'cancelled';
      throw err;
    }
  },
  stop: () => {
    get().stream?.getTracks().forEach((t) => t.stop());
    set({ stream: null });
  },
}));
