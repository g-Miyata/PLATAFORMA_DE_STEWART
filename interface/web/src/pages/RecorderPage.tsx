import { Circle, Copy, Download, FilePlus2, FileUp, ListRestart, Pause, Play, Plus, Send, Square, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inputClass, NumberField, SelectField, SliderField, SwitchField } from '@/components/ui/field';
import { Alert, StatusPill } from '@/components/ui/status';
import { PoseEditor } from '@/features/control/PoseEditor';
import { useCanCommand } from '@/features/control/useControlGate';
import { useGeometry } from '@/features/platform3d/geometry';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { EXAMPLES, exportJson, findRecording, useLibrary, type Recording } from '@/features/recorder/library';
import { useRecorder, type RecordSource } from '@/features/recorder/recorderStore';
import { TimelinePlot } from '@/features/recorder/TimelinePlot';
import {
  analyzeTrajectory,
  duration,
  INTERP_LABEL,
  makeSampler,
  sampleTrajectory,
  simplify,
  type Interp,
  type Keyframe,
} from '@/features/recorder/trajectory';
import { ACTUATOR_SPEED_MM_S } from '@/features/routines/routines';
import { MotionStatusCard, mmss, useMotionStatus } from '@/features/routines/MotionStatusCard';
import { TrackingChart } from '@/features/routines/TrackingChart';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { downloadText, timestampName, toCsv } from '@/lib/csv';
import { fmt } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';

const SPEEDS = [0.5, 0.75, 1, 1.5, 2];

function reducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// ---------------- biblioteca ----------------
function Library({ activeId, onOpen }: { activeId: string | null; onOpen: (id: string) => void }) {
  const items = useLibrary((s) => s.items);
  const file = useRef<HTMLInputElement>(null);

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const n = useLibrary.getState().importJson(await f.text());
      if (n) toast.success(`${n} gravação(ões) importada(s)`);
      else toast.error('Nenhuma gravação válida no arquivo');
    } catch {
      toast.error('Arquivo inválido', { description: 'Use um .json exportado por esta página.' });
    }
  }

  const entry = (r: Recording) => (
    <li key={r.id}>
      <button
        type="button"
        onClick={() => onOpen(r.id)}
        aria-current={activeId === r.id ? 'true' : undefined}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
          activeId === r.id ? 'bg-primary text-on-primary' : 'hover:bg-surface-2',
        )}
      >
        <span className="min-w-0 truncate font-medium">{r.name}</span>
        <span className={cn('shrink-0 text-xs tabular-nums', activeId === r.id ? 'opacity-90' : 'text-muted')}>{mmss(duration(r.keys))}</span>
      </button>
    </li>
  );

  return (
    <Card
      title="Gravações"
      actions={
        <>
          <Button size="sm" variant="secondary" onClick={() => onOpen(useLibrary.getState().create().id)}>
            <FilePlus2 aria-hidden />
            Nova
          </Button>
          <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
            <FileUp aria-hidden />
            Importar
          </Button>
          <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={onImport} aria-label="Importar gravações (.json)" />
        </>
      }
    >
      {items.length ? (
        <ul className="space-y-1">{items.map(entry)}</ul>
      ) : (
        <p className="text-sm text-muted">Nenhuma gravação ainda. Crie uma nova, grave comandos ou comece por um exemplo.</p>
      )}
      <h3 className="mb-1 mt-4 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Exemplos</h3>
      <ul className="space-y-1">{EXAMPLES.map(entry)}</ul>
    </Card>
  );
}

// ---------------- gravação global ----------------
function RecorderCard() {
  const status = useRecorder((s) => s.status);
  const [source, setSource] = useState<RecordSource>('comandos');
  const recording = status === 'recording';
  return (
    <Card title="Gravar" icon={<Circle aria-hidden />} description="Grava o que você comandar em qualquer página (Joystick, Bancada 3D, Cinemática, IMU). O indicador ● REC fica no topo até você parar.">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField label="O que gravar" value={source} onChange={(e) => setSource(e.target.value as RecordSource)} disabled={recording}>
          <option value="comandos">Poses comandadas</option>
          <option value="medido">Pose medida (telemetria)</option>
        </SelectField>
        {recording ? (
          <Button variant="danger" onClick={() => useRecorder.getState().stop()}>
            <Square aria-hidden />
            Parar gravação
          </Button>
        ) : (
          <Button variant="primary" onClick={() => useRecorder.getState().start(source)}>
            <Circle aria-hidden />
            Começar a gravar
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---------------- editor ----------------
function Feasibility({ rec, geometryValid }: { rec: Recording; geometryValid: ReturnType<typeof analyzeTrajectory> }) {
  const a = geometryValid;
  if (!a.valid)
    return (
      <Alert tone="danger" title="Fora do curso">
        Em {fmt(a.firstInvalid!.t, 1)} s a trajetória pede um comprimento fora do curso dos pistões. Ajuste as poses-chave perto desse instante.
      </Alert>
    );
  if (a.tooFast)
    return (
      <Alert tone="warning" title="Rápido demais para os atuadores">
        Pico de {fmt(a.peakSpeed, 1)} mm/s (os atuadores sustentam ~{ACTUATOR_SPEED_MM_S} mm/s): a plataforma real vai atrasar. Espace as poses-chave ou reduza a velocidade ({rec.speed}×).
      </Alert>
    );
  return (
    <Alert tone="success" title="Viável">
      Dentro do curso, com pico de {fmt(a.peakSpeed, 1)} mm/s nos atuadores.
    </Alert>
  );
}

export default function RecorderPage() {
  const geometry = useGeometry();
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const activeId = useLibrary((s) => s.activeId);
  const items = useLibrary((s) => s.items);
  const rec = useMemo(() => findRecording(activeId) ?? EXAMPLES[0], [activeId, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const [time, setTime] = useState(0);
  // prévia: instante de partida e relógio (performance.now) de quando começou
  const [playFrom, setPlayFrom] = useState<{ t0: number; at: number } | null>(null);
  const playing = playFrom !== null;
  const stopPreview = () => setPlayFrom(null);
  const [selected, setSelected] = useState<number | null>(0);
  const motion = useMotionStatus();
  const running = !!motion.data?.running;

  const total = duration(rec.keys);
  const sampler = useMemo(() => makeSampler(rec.keys, rec.interp), [rec.keys, rec.interp]);
  const previewPose = useMemo(() => sampler(Math.min(time, total)), [sampler, time, total]);
  const samples = useMemo(() => sampleTrajectory(rec.keys, rec.interp), [rec.keys, rec.interp]);
  const check = useMemo(() => analyzeTrajectory(samples, geometry, rec.speed), [samples, geometry, rec.speed]);
  const sel = selected !== null && selected < rec.keys.length ? selected : null;

  // prévia só no modelo (requestAnimationFrame)
  useEffect(() => {
    if (!playFrom) return;
    let raf = 0;
    const tick = (now: number) => {
      const t = playFrom.t0 + ((now - playFrom.at) / 1000) * rec.speed;
      if (t <= total) setTime(t);
      else if (rec.loop && total > 0) setTime(t % total);
      else {
        setTime(total);
        setPlayFrom(null);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playFrom, total, rec.speed, rec.loop]);

  function open(id: string) {
    useLibrary.getState().setActive(id);
    setTime(0);
    stopPreview();
    setSelected(0);
  }

  /** Exemplos são só leitura: a primeira edição cria uma cópia e segue nela. */
  function edit(patch: Partial<Omit<Recording, 'id'>>) {
    if (rec.example) {
      const copy = useLibrary.getState().duplicate(rec.id);
      if (copy) useLibrary.getState().update(copy.id, patch);
      toast.info('Exemplo copiado para as suas gravações', { description: 'Os exemplos não mudam; você está editando a cópia.' });
      return;
    }
    useLibrary.getState().update(rec.id, patch);
  }

  function setKeys(keys: Keyframe[], select?: number) {
    edit({ keys });
    if (select !== undefined) setSelected(select);
  }

  function addKeyAtTime() {
    const t = Math.round(Math.min(time, total) * 20) / 20;
    // no fim da linha do tempo, acrescenta 2 s depois; no meio, insere no instante
    const atEnd = t >= total - 0.025;
    const existing = rec.keys.findIndex((k) => Math.abs(k.t - t) < 0.025);
    if (existing >= 0 && !atEnd) return setSelected(existing);
    const t2 = atEnd ? total + 2 : t;
    const keys = [...rec.keys, { t: t2, pose: sampler(t) }].sort((a, b) => a.t - b.t);
    setKeys(keys, keys.findIndex((k) => k.t === t2));
    setTime(t2);
  }

  function duplicateKey(i: number) {
    const next = rec.keys[i + 1];
    const t = next ? (rec.keys[i].t + next.t) / 2 : rec.keys[i].t + 2;
    const keys = [...rec.keys.slice(0, i + 1), { t, pose: { ...rec.keys[i].pose } }, ...rec.keys.slice(i + 1)];
    setKeys(keys, i + 1);
  }

  function removeKey(i: number) {
    if (rec.keys.length <= 1) return;
    let keys = rec.keys.filter((_, k) => k !== i);
    // a linha do tempo sempre começa em 0
    const t0 = keys[0].t;
    keys = keys.map((k) => ({ ...k, t: k.t - t0 }));
    setKeys(keys, Math.max(0, i - 1));
  }

  function setKeyTime(i: number, t: number) {
    const lo = i === 0 ? 0 : rec.keys[i - 1].t + 0.05;
    const hi = i === rec.keys.length - 1 ? 3600 : rec.keys[i + 1].t - 0.05;
    const value = i === 0 ? 0 : Math.min(hi, Math.max(lo, t));
    setKeys(rec.keys.map((k, n) => (n === i ? { ...k, t: value } : k)));
  }

  function simplifyKeys() {
    const before = rec.keys.length;
    const keys = simplify(rec.keys, 1, 0.3);
    setKeys(keys, 0);
    toast.success(`${before} → ${keys.length} poses-chave`);
  }

  async function playOnPlatform() {
    try {
      const r = await api.trajectoryStart({ samples, loop: rec.loop, speed: rec.speed, name: rec.name });
      toast.success(simulated ? 'Reproduzindo no simulador' : 'Reproduzindo na plataforma', { description: `${mmss(r.duration_s)} · Esc para parar` });
      void motion.refetch();
    } catch (err) {
      toast.error('Não foi possível reproduzir', { description: (err as Error).message });
    }
  }

  function exportCsv() {
    const header = ['t_s', 'x_mm', 'y_mm', 'z_mm', 'roll_deg', 'pitch_deg', 'yaw_deg'];
    downloadText(timestampName('trajetoria'), toCsv(header, samples.map((s) => [s.t, s.x, s.y, s.z, s.roll, s.pitch, s.yaw].map((v) => Number(v.toFixed(3))))));
  }

  const key = sel !== null ? rec.keys[sel] : null;

  return (
    <>
      <PageHeader
        title="Gravar e reproduzir"
        description="Grave movimentos, edite as poses-chave numa linha do tempo e reproduza na plataforma. A prévia roda só no modelo, sem mover nada."
      />
      <div className="grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="space-y-5">
          <Library activeId={rec.id} onOpen={open} />
          <RecorderCard />
        </div>

        <div className="min-w-0 space-y-5">
          <Card
            title={rec.example ? `${rec.name} (exemplo)` : rec.name}
            actions={
              <>
                {!rec.example && (
                  <Button size="sm" variant="ghost" onClick={() => useLibrary.getState().duplicate(rec.id)}>
                    <Copy aria-hidden />
                    Duplicar
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => downloadText(`${rec.name.replace(/[^\w-]+/g, '_')}.json`, exportJson([rec]), 'application/json')}>
                  <Download aria-hidden />
                  JSON
                </Button>
                <Button size="sm" variant="ghost" onClick={exportCsv}>
                  <Download aria-hidden />
                  CSV
                </Button>
                {!rec.example && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm(`Apagar "${rec.name}"?`)) useLibrary.getState().remove(rec.id);
                    }}
                  >
                    <Trash2 aria-hidden />
                    Apagar
                  </Button>
                )}
              </>
            }
          >
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
              <PlatformViewer
                source={running ? 'auto' : 'target'}
                followMotion={running}
                target={previewPose}
                title={running ? 'Na plataforma' : 'Prévia'}
                targetLabel={running ? 'Comandada' : 'Prévia'}
                hideTitle
                expandable
                showTable={false}
                canvasClassName="h-72 sm:h-80"
              />
              <div className="min-w-0 space-y-4">
                <TimelinePlot keys={rec.keys} interp={rec.interp} homeZ={geometry.home_z} time={Math.min(time, total)} selected={sel} onSelect={(i) => {
                  setSelected(i);
                  setTime(rec.keys[i].t);
                  stopPreview();
                }} />
                <div className="flex flex-wrap items-end gap-3">
                  <Button
                    variant="primary"
                    onClick={() => {
                      if (playing) return stopPreview();
                      setPlayFrom({ t0: time >= total ? 0 : time, at: performance.now() });
                    }}
                    disabled={total <= 0}
                    aria-pressed={playing}
                  >
                    {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
                    {playing ? 'Pausar prévia' : 'Prévia no modelo'}
                  </Button>
                  <Button variant="ghost" onClick={() => setTime(0)} disabled={time === 0}>
                    <ListRestart aria-hidden />
                    Início
                  </Button>
                  <p className="ml-auto text-sm tabular-nums text-muted" aria-live="off">
                    {mmss(Math.min(time, total))} / {mmss(total)}
                  </p>
                </div>
                <SliderField label="Instante" value={Math.min(time, total)} onValueChange={(v) => {
                  stopPreview();
                  setTime(v);
                }} min={0} max={Math.max(total, 0.05)} step={0.05} unit="s" unitSpoken="segundos" digits={2} />
                {reducedMotion() && <p className="text-xs text-muted">Movimento reduzido está ativo no sistema: prefira arrastar o instante em vez da prévia animada.</p>}
              </div>
            </div>
          </Card>

          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card
              title="Poses-chave"
              description={`${rec.keys.length} no total. Clique numa para editar.`}
              actions={
                <>
                  <Button size="sm" variant="secondary" onClick={addKeyAtTime}>
                    <Plus aria-hidden />
                    No instante
                  </Button>
                  {rec.keys.length > 12 && (
                    <Button size="sm" variant="ghost" onClick={simplifyKeys}>
                      <Wand2 aria-hidden />
                      Simplificar
                    </Button>
                  )}
                </>
              }
            >
              <ol className="max-h-72 space-y-1 overflow-y-auto pr-1" aria-label="Lista de poses-chave">
                {rec.keys.map((k, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(i);
                        setTime(k.t);
                        stopPreview();
                      }}
                      aria-current={sel === i ? 'true' : undefined}
                      className={cn(
                        'grid w-full grid-cols-[3.5rem_1fr] gap-2 rounded-lg px-3 py-1.5 text-left text-sm tabular-nums transition-colors',
                        sel === i ? 'bg-primary text-on-primary' : 'hover:bg-surface-2',
                      )}
                    >
                      <span className="font-semibold">{fmt(k.t, 1)} s</span>
                      <span className={cn('truncate', sel !== i && 'text-muted')}>
                        X {fmt(k.pose.x, 0)} · Y {fmt(k.pose.y, 0)} · Z {fmt(k.pose.z, 0)} · roll {fmt(k.pose.roll, 1)}° · pitch {fmt(k.pose.pitch, 1)}° · yaw {fmt(k.pose.yaw, 1)}°
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="rec-name" className="text-sm font-medium">
                    Nome
                  </label>
                  <input
                    id="rec-name"
                    className={inputClass}
                    value={rec.name}
                    maxLength={80}
                    onChange={(e) => edit({ name: e.target.value })}
                  />
                </div>
                <SelectField label="Interpolação" value={rec.interp} onChange={(e) => edit({ interp: e.target.value as Interp })}>
                  {(Object.keys(INTERP_LABEL) as Interp[]).map((k) => (
                    <option key={k} value={k}>
                      {INTERP_LABEL[k]}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Velocidade" value={String(rec.speed)} onChange={(e) => edit({ speed: Number(e.target.value) })}>
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {String(s).replace('.', ',')}×
                    </option>
                  ))}
                </SelectField>
                <div className="flex items-end">
                  <SwitchField label="Repetir" checked={rec.loop} onCheckedChange={(loop) => edit({ loop })} />
                </div>
              </div>
            </Card>

            <Card
              title={key ? `Pose-chave ${sel! + 1}` : 'Pose-chave'}
              actions={
                key && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => duplicateKey(sel!)}>
                      <Copy aria-hidden />
                      Duplicar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeKey(sel!)} disabled={rec.keys.length <= 1}>
                      <Trash2 aria-hidden />
                      Remover
                    </Button>
                  </>
                )
              }
            >
              {key ? (
                <div className="space-y-4">
                  <NumberField
                    label="Instante"
                    unit="s"
                    value={key.t}
                    step={0.1}
                    min={0}
                    disabled={sel === 0}
                    hint={sel === 0 ? 'A primeira pose-chave é sempre o início (0 s).' : undefined}
                    onValueChange={(t) => setKeyTime(sel!, t)}
                  />
                  <PoseEditor pose={key.pose} onChange={(pose) => setKeys(rec.keys.map((k, n) => (n === sel ? { ...k, pose } : k)))} />
                </div>
              ) : (
                <p className="text-sm text-muted">Selecione uma pose-chave na lista ou na linha do tempo.</p>
              )}
            </Card>
          </div>

          <Card title="Na plataforma" icon={<Send aria-hidden />} actions={check.valid ? <StatusPill tone={check.tooFast ? 'warning' : 'success'}>{check.tooFast ? 'Rápida' : 'Viável'}</StatusPill> : <StatusPill tone="danger">Fora do curso</StatusPill>}>
            <div className="space-y-4">
              <Feasibility rec={rec} geometryValid={check} />
              {!canCommand && <Alert tone="info">Conecte o simulador ou a porta serial no topo para reproduzir. A prévia funciona sem conexão.</Alert>}
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={playOnPlatform} disabled={!canCommand || !check.valid || running}>
                  <Play aria-hidden />
                  {simulated ? 'Reproduzir no simulador' : 'Reproduzir na plataforma'}
                </Button>
                <p className="text-sm text-muted">
                  A plataforma vai ao home, se aproxima da primeira pose e segue a trajetória a 60 Hz. <kbd>Esc</kbd> para tudo.
                </p>
              </div>
            </div>
          </Card>
          <MotionStatusCard />
          <TrackingChart />
        </div>
      </div>
    </>
  );
}
