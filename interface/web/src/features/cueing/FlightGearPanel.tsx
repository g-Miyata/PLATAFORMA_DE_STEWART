import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Maximize2, MonitorPlay, Plane, Play, RefreshCw, Square, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, StatusPill, type Tone } from '@/components/ui/status';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { CueingProfile, FgStatus } from '@/lib/types';
import { useCueing } from '@/stores/cueing';
import { captureSupported, useFgCapture } from './fgCapture';

const STATE: Record<FgStatus['state'], { tone: Tone; text: string }> = {
  stopped: { tone: 'neutral', text: 'Fechado' },
  starting: { tone: 'warning', text: 'Abrindo…' },
  loading: { tone: 'warning', text: 'Carregando o cenário…' },
  ready: { tone: 'success', text: 'No ar' },
  crashed: { tone: 'danger', text: 'Fechou sozinho' },
  stuck: { tone: 'danger', text: 'Travado' },
};

/** Estado do FlightGear aberto pelo backend (compartilhado entre os cartões). */
export function useFgStatus() {
  return useQuery({
    queryKey: ['fg-status'],
    queryFn: api.fgStatus,
    refetchInterval: (q) => (q.state.data?.state === 'starting' || q.state.data?.state === 'loading' ? 1000 : 2500),
  });
}

export function useFgReady() {
  return useFgStatus().data?.state === 'ready';
}

function Checklist({ onRecheck }: { onRecheck: () => void }) {
  const check = useQuery({ queryKey: ['fg-check'], queryFn: api.fgCheck, staleTime: 30_000 });
  const [open, setOpen] = useState(false);
  const items = check.data?.items ?? [];
  const problems = items.filter((i) => !i.ok);
  const expanded = open || problems.some((i) => i.severity === 'error');

  if (check.isLoading) {
    return (
      <p className="text-sm text-muted" role="status">
        Conferindo FlightGear, dados base, ERJ145 e portas…
      </p>
    );
  }
  if (check.error) {
    return <Alert tone="danger">Não foi possível conferir os pré-requisitos: {(check.error as Error).message}</Alert>;
  }
  return (
    <div className="space-y-2">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-sm" aria-expanded={expanded} onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-2">
          {check.data?.ok ? <StatusPill tone="success">Pré-requisitos ok</StatusPill> : <StatusPill tone="danger">Falta algo para rodar</StatusPill>}
          {problems.length > 0 && check.data?.ok && <span className="text-xs text-muted">{problems.length} aviso(s)</span>}
        </span>
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="flex gap-2 text-sm">
              {i.ok ? (
                <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              ) : (
                <XCircle aria-hidden className={cn('mt-0.5 size-4 shrink-0', i.severity === 'error' ? 'text-danger' : 'text-warning')} />
              )}
              <div className="min-w-0">
                <p className="font-medium">
                  {i.label}
                  <span className="sr-only">{i.ok ? ': ok' : i.severity === 'error' ? ': falta' : ': aviso'}</span>
                </p>
                <p className="break-words text-xs text-muted">{i.detail}</p>
                {i.fix && <p className="break-words text-xs">{i.fix}</p>}
              </div>
            </li>
          ))}
          <li>
            <Button size="sm" variant="ghost" onClick={onRecheck}>
              <RefreshCw aria-hidden />
              Conferir de novo
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}

/** Vídeo da captura de janela (srcObject não é atributo do React). */
function CaptureVideo({ stream }: { stream: MediaStream }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={video}
      autoPlay
      muted
      playsInline
      className="size-full object-contain"
      aria-label="Captura ao vivo da janela do FlightGear: o ERJ145 voando o voo gravado, visto de trás."
    />
  );
}

/**
 * FlightGear dentro da página: o backend abre o simulador sem física com o ERJ145 do
 * IFSP, manda a posição do voo que está tocando e a imagem volta pelo MJPEG (/fg/stream).
 */
export function FlightGearPanel({ profile, className }: { profile: CueingProfile; className?: string }) {
  const qc = useQueryClient();
  const status = useFgStatus();
  const tick = useCueing((s) => s.tick);
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const state = status.data?.state ?? 'stopped';
  // um FlightGear novo (outro PID) ou "Recarregar" pedem uma conexão nova com a imagem
  const streamKey = `${status.data?.pid ?? 0}-${retry}`;
  const streamError = failedKey === streamKey;
  const ready = state === 'ready';
  const replay = tick?.source === 'replay' ? tick.replay : null;
  const needsVisual = !!replay && replay.has_visual && !replay.visual && replay.profile === profile;
  const capture = useFgCapture((s) => s.stream);
  const startCapture = useFgCapture((s) => s.start);
  const stopCapture = useFgCapture((s) => s.stop);

  // FlightGear fechou: a captura da janela não tem mais o que mostrar
  useEffect(() => {
    if (!ready && state !== 'loading' && capture) stopCapture();
  }, [ready, state, capture, stopCapture]);

  async function capture60() {
    try {
      const r = await startCapture();
      if (r === 'unsupported') toast.error('Este navegador não captura janelas', { description: 'Use o Chrome ou o Edge; a imagem do servidor continua valendo.' });
    } catch (err) {
      toast.error('Não foi possível capturar a janela', { description: (err as Error).message });
    }
  }

  // FlightGear ficou pronto com um voo tocando por esta tela: passa a mandar a posição
  useEffect(() => {
    if (ready && needsVisual) api.cueingReplayUpdate({ visual: true }).catch(() => {});
  }, [ready, needsVisual]);

  function recheck() {
    qc.invalidateQueries({ queryKey: ['fg-check'] });
  }

  async function launch() {
    setBusy(true);
    try {
      await api.fgLaunch(replay?.id ?? null);
      toast.success('Abrindo o FlightGear', { description: 'O cenário leva de 20 s a 1 min para carregar.' });
    } catch (err) {
      toast.error('Não foi possível abrir o FlightGear', { description: (err as Error).message });
      recheck();
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['fg-status'] });
    }
  }

  async function stop() {
    setBusy(true);
    try {
      await api.fgStop();
    } catch (err) {
      toast.error('Falhou', { description: (err as Error).message });
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['fg-status'] });
    }
  }

  const running = state === 'starting' || state === 'loading' || ready || state === 'stuck';
  const error = status.data?.error;

  return (
    <Card
      className={className}
      title="FlightGear"
      icon={<Plane aria-hidden />}
      description="O ERJ145 do IFSP voa o voo gravado sincronizado com a plataforma. Rode, depois dê Play num voo."
      actions={
        <>
          <StatusPill tone={STATE[state].tone}>{STATE[state].text}</StatusPill>
          {running ? (
            <Button size="sm" variant="secondary" onClick={stop} disabled={busy}>
              <Square aria-hidden />
              Fechar
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={launch} disabled={busy}>
              <Play aria-hidden />
              Rodar no FlightGear
            </Button>
          )}
        </>
      }
    >
      <div ref={box} className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
        {capture ? (
          <CaptureVideo stream={capture} />
        ) : ready && !streamError ? (
          <img
            key={streamKey}
            src={`/fg/stream?k=${streamKey}`}
            alt="Imagem ao vivo do FlightGear: o ERJ145 voando o voo gravado, visto de trás."
            className="size-full object-contain"
            onError={() => setFailedKey(streamKey)}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-4 text-center text-sm text-white/80">
            {ready && streamError ? (
              <>
                <p>A imagem do FlightGear parou.</p>
                <Button size="sm" variant="secondary" onClick={() => setRetry((r) => r + 1)}>
                  <RefreshCw aria-hidden />
                  Recarregar imagem
                </Button>
              </>
            ) : state === 'starting' || state === 'loading' ? (
              <p role="status">{state === 'starting' ? 'Abrindo o FlightGear…' : 'Carregando o cenário…'} {status.data?.uptime ? `${Math.round(status.data.uptime)} s` : ''}</p>
            ) : (
              <p>Clique em Rodar no FlightGear para ver o avião aqui.</p>
            )}
          </div>
        )}
        {(capture || (ready && !streamError)) && (
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2 size-8 opacity-80 hover:opacity-100"
            onClick={() => box.current?.requestFullscreen?.()}
            aria-label="Imagem do FlightGear em tela cheia"
          >
            <Maximize2 aria-hidden />
          </Button>
        )}
      </div>

      {ready && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {capture ? (
            <>
              <StatusPill tone="success">Captura da janela · até 60 fps</StatusPill>
              <Button size="sm" variant="ghost" onClick={stopCapture}>
                Voltar para a imagem do servidor
              </Button>
            </>
          ) : (
            captureSupported() && (
              <>
                <Button size="sm" variant="secondary" onClick={capture60}>
                  <MonitorPlay aria-hidden />
                  Imagem fluida (capturar a janela)
                </Button>
                <span className="text-xs text-muted">A imagem do servidor tem ~7 fps e compressão JPEG; na lista, escolha a janela do FlightGear.</span>
              </>
            )
          )}
        </div>
      )}

      {ready && replay && !replay.has_visual && (
        <Alert tone="info" className="mt-3">
          Este voo foi gravado sem posição do avião (formato antigo): a plataforma toca, mas o FlightGear fica parado. Grave um voo novo ou use a rotina do ERJ145.
        </Alert>
      )}

      {error && (state === 'crashed' || state === 'stuck') && (
        <Alert tone="danger" className="mt-3" title={error.message}>
          {error.log && error.log.length > 0 && (
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-2 p-2 font-mono text-[11px]">{error.log.join('\n')}</pre>
          )}
          {error.hint && <p className="mt-2 text-xs">{error.hint}</p>}
        </Alert>
      )}

      <div className="mt-3">
        <Checklist onRecheck={recheck} />
      </div>
      <p className="mt-3 text-xs text-muted">
        A janela do FlightGear abre junto; deixe aberta (pode ficar atrás desta). Minimizada, a imagem para. Passo a passo e erros comuns em FLIGHTGEAR-SETUP.md.
      </p>
    </Card>
  );
}
