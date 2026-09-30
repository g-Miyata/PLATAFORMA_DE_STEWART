import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Circle, Pause, Plane, Play, Radio, Repeat, Save, Square, Trash2, X } from 'lucide-react';
import { Tabs } from 'radix-ui';
import { useState } from 'react';
import { toast } from 'sonner';
import { confirmDialog } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inputClass, SelectField, SwitchField } from '@/components/ui/field';
import { StatusPill } from '@/components/ui/status';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { fmt } from '@/lib/pistons';
import type { CueingProfile, CueingStatus } from '@/lib/types';
import { useCueing } from '@/stores/cueing';
import { useFgReady } from './FlightGearPanel';

const SPEEDS = [0.5, 1, 1.5, 2];

export function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

async function run(fn: () => Promise<unknown>, ok?: string) {
  try {
    await fn();
    if (ok) toast.success(ok);
    return true;
  } catch (err) {
    toast.error('Falhou', { description: (err as Error).message });
    return false;
  }
}

const tabClass =
  'rounded-md px-3 py-1.5 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-on-primary';

function LiveTab({ status }: { status: CueingStatus | undefined }) {
  const qc = useQueryClient();
  const tick = useCueing((s) => s.tick);
  const [name, setName] = useState('');
  const bridge = status?.bridge;
  const receiving = !!bridge?.receiving;
  const recording = status?.recording ?? null;
  const ac = tick?.source === 'live' ? tick.aircraft : null;
  const replaying = status?.source === 'replay';

  async function stopRecording() {
    const label = name.trim() || `Voo ${new Date().toLocaleString('pt-BR')}`;
    if (await run(() => api.cueingRecordStop(label), `Voo "${label}" salvo`)) {
      setName('');
      qc.invalidateQueries({ queryKey: ['cueing-flights'] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {receiving ? (
          <StatusPill tone="success">Recebendo do FlightGear · {fmt(bridge?.rate_hz, 0)} Hz</StatusPill>
        ) : bridge?.connected ? (
          <StatusPill tone="warning">Ponte conectada, sem frames do FlightGear</StatusPill>
        ) : (
          <StatusPill tone="neutral">Ponte desconectada</StatusPill>
        )}
        {replaying && <StatusPill tone="info">Voo gravado tocando: dados ao vivo ignorados</StatusPill>}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-sm tabular-nums">
        {[
          ['Velocidade', ac ? fmt(ac.ias, 0, ' kt') : '—'],
          ['Altura', ac ? fmt(ac.agl, 0, ' ft') : '—'],
          ['Proa', ac ? fmt(ac.heading, 0, '°') : '—'],
          ['Roll', ac ? fmt(ac.roll, 1, '°') : '—'],
          ['Pitch', ac ? fmt(ac.pitch, 1, '°') : '—'],
          ['No chão', ac ? (ac.wow ? 'sim' : 'não') : '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      {recording ? (
        <div className="space-y-2 rounded-lg border border-danger/40 bg-danger-soft p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger" role="status">
            <Circle aria-hidden className="size-3 animate-pulse fill-current" />
            Gravando · {clock(recording.duration)} · {recording.samples} amostras
          </p>
          <label className="block text-sm font-medium" htmlFor="cueing-rec-name">
            Nome do voo
          </label>
          <input id="cueing-rec-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: decolagem e curvas em SBGR" maxLength={80} />
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={stopRecording} disabled={recording.samples < 2}>
              <Save aria-hidden />
              Parar e salvar
            </Button>
            <Button variant="ghost" onClick={() => run(api.cueingRecordDiscard, 'Gravação descartada')}>
              <X aria-hidden />
              Descartar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => run(api.cueingRecordStart)} disabled={!receiving || replaying}>
          <Circle aria-hidden className="fill-danger text-danger" />
          Gravar voo
        </Button>
      )}
    </div>
  );
}

interface TabProps {
  status: CueingStatus | undefined;
  profile: CueingProfile;
  onAnalyze: (id: string) => void;
}

function FlightsTab({ status, profile, onAnalyze }: TabProps) {
  const qc = useQueryClient();
  const fgReady = useFgReady();
  const flights = useQuery({ queryKey: ['cueing-flights'], queryFn: api.cueingFlights });
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const tick = useCueing((s) => s.tick);
  const replay = (tick?.source === 'replay' ? tick.replay : null) ?? status?.replay ?? null;

  async function remove(id: string, label: string) {
    const ok = await confirmDialog({
      title: `Apagar o voo “${label}”?`,
      description: 'O arquivo em interface/simulation/flights é removido. Não dá para desfazer.',
      confirmLabel: 'Apagar voo',
      tone: 'danger',
    });
    if (!ok) return;
    if (await run(() => api.cueingDeleteFlight(id), 'Voo apagado')) qc.invalidateQueries({ queryKey: ['cueing-flights'] });
  }

  return (
    <div className="space-y-4">
      {replay && (
        <div className="space-y-3 rounded-lg border border-info/40 bg-info-soft p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-semibold">{replay.name}</p>
            <p className="text-xs tabular-nums text-muted">
              {clock(replay.t)} / {clock(replay.duration)}
            </p>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso do voo"
            aria-valuemin={0}
            aria-valuemax={Math.round(replay.duration)}
            aria-valuenow={Math.round(replay.t)}
            className="h-2 overflow-hidden rounded-full bg-surface-3"
          >
            <div className="h-full bg-info transition-[width]" style={{ width: `${(100 * replay.t) / Math.max(1, replay.duration)}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => run(() => api.cueingReplayUpdate({ paused: !replay.paused }))}>
              {replay.paused ? <Play aria-hidden /> : <Pause aria-hidden />}
              {replay.paused ? 'Continuar' : 'Pausar'}
            </Button>
            <Button size="sm" variant="danger" onClick={() => run(api.cueingReplayStop)}>
              <Square aria-hidden />
              Parar
            </Button>
            <span className="text-xs text-muted">
              {replay.speed}× {replay.loop ? '· repetindo' : ''}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 items-end gap-3">
        <SelectField
          label="Velocidade"
          value={speed}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpeed(v);
            if (replay) run(() => api.cueingReplayUpdate({ speed: v }));
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </SelectField>
        <SwitchField
          label={
            <span className="inline-flex items-center gap-1">
              <Repeat aria-hidden className="size-4" /> Repetir
            </span>
          }
          checked={loop}
          onCheckedChange={(v) => {
            setLoop(v);
            if (replay) run(() => api.cueingReplayUpdate({ loop: v }));
          }}
        />
      </div>

      {flights.isLoading ? (
        <p className="text-sm text-muted" role="status">
          Carregando voos…
        </p>
      ) : !flights.data?.length ? (
        <p className="text-sm text-muted">Nenhum voo gravado. Grave um na aba Ao vivo.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {flights.data.map((fl) => {
            const playing = replay?.id === fl.id;
            return (
              <li key={fl.id} className={cn('flex flex-wrap items-center gap-2 p-3', playing && 'bg-surface-2')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{fl.name}</p>
                  <p className="text-xs text-muted">
                    {clock(fl.duration_s)}
                    {fl.aircraft ? ` · ${fl.aircraft}` : ''}
                    {fl.recorded_at ? ` · ${new Date(fl.recorded_at).toLocaleDateString('pt-BR')}` : ''}
                  </p>
                  {fl.description && <p className="mt-0.5 text-xs text-muted">{fl.description}</p>}
                  {fl.visual && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-brand-text">
                      <Plane aria-hidden className="size-3.5" /> Aparece no FlightGear
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => run(() => api.cueingReplayStart({ flight: fl.id, speed, loop, profile, visual: fgReady && fl.visual }))}
                  aria-label={`Tocar ${fl.name}`}
                >
                  <Play aria-hidden />
                  Play
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onAnalyze(fl.id)} aria-label={`Analisar ${fl.name}`}>
                  <BarChart3 aria-hidden />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(fl.id, fl.name)} disabled={playing} aria-label={`Apagar ${fl.name}`}>
                  <Trash2 aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** De onde vem o movimento: FlightGear ao vivo ou um voo gravado. */
export function SourcePanel({ status, profile, onAnalyze }: TabProps) {
  const [tab, setTab] = useState('gravados');
  return (
    <Card title="Fonte do movimento" icon={<Radio aria-hidden />}>
      <Tabs.Root value={tab} onValueChange={setTab} className="space-y-4">
        <Tabs.List aria-label="Fonte do movimento" className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1">
          <Tabs.Trigger value="gravados" className={tabClass}>
            Voos gravados
          </Tabs.Trigger>
          <Tabs.Trigger value="vivo" className={tabClass}>
            Ao vivo (FlightGear)
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="gravados" className="outline-none">
          <FlightsTab status={status} profile={profile} onAnalyze={onAnalyze} />
        </Tabs.Content>
        <Tabs.Content value="vivo" className="outline-none">
          <LiveTab status={status} />
        </Tabs.Content>
      </Tabs.Root>
    </Card>
  );
}
