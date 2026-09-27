import { Download, FileUp, ListRestart, Pause, Play, Save, Send } from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageLayout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SelectField, SliderField } from '@/components/ui/field';
import { Alert, StatusPill } from '@/components/ui/status';
import { BlocklyEditor } from '@/features/blocks/BlocklyEditor';
import { compileProgram, EXAMPLE_PROGRAMS, stepAt, type CompileError, type WorkspaceJson } from '@/features/blocks/compile';
import { useCanCommand } from '@/features/control/useControlGate';
import { useGeometry } from '@/features/platform3d/geometry';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';
import { useLibrary } from '@/features/recorder/library';
import { analyzeTrajectory, makeSampler, sampleTrajectory } from '@/features/recorder/trajectory';
import { usePreviewClock } from '@/features/recorder/usePreviewClock';
import { ACTUATOR_SPEED_MM_S } from '@/features/routines/routines';
import { MotionStatusCard, mmss, useMotionStatus } from '@/features/routines/MotionStatusCard';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { downloadText } from '@/lib/csv';
import { fmt } from '@/lib/pistons';
import { useConnection } from '@/stores/connection';

const STORAGE_KEY = 'stewart-blocks-program';

function loadSaved(): WorkspaceJson | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceJson) : null;
  } catch {
    return null;
  }
}

function save(json: WorkspaceJson) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
  } catch {
    /* sem storage: o programa fica só nesta sessão */
  }
}

export default function BlocksPage() {
  const geometry = useGeometry();
  const canCommand = useCanCommand();
  const simulated = useConnection((s) => s.serial.simulated);
  const navigate = useNavigate();
  const motion = useMotionStatus();
  const running = !!motion.data?.running;
  const file = useRef<HTMLInputElement>(null);

  const [initial, setInitial] = useState<WorkspaceJson>(() => loadSaved() ?? EXAMPLE_PROGRAMS[0].build());
  const [programKey, setProgramKey] = useState('salvo');
  const [json, setJson] = useState<WorkspaceJson>(initial);
  const [exampleId, setExampleId] = useState('');

  const onChange = useCallback((j: WorkspaceJson) => {
    setJson(j);
    save(j);
  }, []);

  function loadProgram(j: WorkspaceJson, key: string) {
    setInitial(j);
    setProgramKey(key);
  }

  const compiled = useMemo(() => compileProgram(json, geometry.home_z), [json, geometry.home_z]);
  const ok = compiled.errors.length === 0;
  const samples = useMemo(() => (ok ? sampleTrajectory(compiled.keys, compiled.interp) : []), [ok, compiled]);
  const check = useMemo(() => (ok ? analyzeTrajectory(samples, geometry) : null), [ok, samples, geometry]);
  const sampler = useMemo(() => makeSampler(compiled.keys, compiled.interp), [compiled]);
  const clock = usePreviewClock(compiled.duration);
  const previewPose = useMemo(() => sampler(clock.time), [sampler, clock.time]);
  const activeStep = clock.playing || clock.time > 0 ? stepAt(compiled.steps, clock.time) : null;

  // fora do curso: aponta o bloco do instante problemático
  const errors: CompileError[] = useMemo(() => {
    if (!ok) return compiled.errors;
    if (check && !check.valid) {
      const s = stepAt(compiled.steps, check.firstInvalid!.t);
      return [{ blockId: s?.blockId, message: `Passa dos limites da bancada em ${fmt(check.firstInvalid!.t, 1)} s.` }];
    }
    return [];
  }, [ok, compiled, check]);

  async function play() {
    try {
      const r = await api.trajectoryStart({ samples, name: 'Programa em blocos' });
      toast.success(simulated ? 'Reproduzindo no simulador' : 'Reproduzindo na plataforma', { description: `${mmss(r.duration_s)} · Esc para parar` });
      void motion.refetch();
    } catch (err) {
      toast.error('Não foi possível reproduzir', { description: (err as Error).message });
    }
  }

  function saveAsRecording() {
    const rec = useLibrary.getState().create({ name: 'Programa em blocos', interp: compiled.interp, keys: compiled.keys });
    toast.success('Salvo em Gravar e reproduzir', { description: rec.name, action: { label: 'Abrir', onClick: () => navigate('/gravar') } });
  }

  async function onImport(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const j = JSON.parse(await f.text()) as WorkspaceJson;
      if (!j.blocks) throw new Error();
      loadProgram(j, `import-${Date.now()}`);
      toast.success('Programa importado');
    } catch {
      toast.error('Arquivo inválido', { description: 'Use um .json exportado por esta página.' });
    }
  }

  return (
    <>
      <PageHeader
        title="Programação em blocos"
        description="Monte uma sequência encaixando blocos, como no Scratch. O programa vira uma trajetória: veja a prévia no modelo e reproduza na plataforma."
      />
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card
          title="Programa"
          actions={
            <>
              <SelectField
                label="Exemplos"
                hideLabel
                value={exampleId}
                onChange={(e) => {
                  const ex = EXAMPLE_PROGRAMS.find((p) => p.id === e.target.value);
                  setExampleId('');
                  if (ex && window.confirm(`Trocar o programa atual pelo exemplo "${ex.name}"?`)) loadProgram(ex.build(), `${ex.id}-${Date.now()}`);
                }}
              >
                <option value="">Abrir exemplo…</option>
                {EXAMPLE_PROGRAMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </SelectField>
              <Button size="sm" variant="ghost" onClick={() => downloadText('programa-blocos.json', JSON.stringify(json, null, 2), 'application/json')}>
                <Download aria-hidden />
                Exportar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => file.current?.click()}>
                <FileUp aria-hidden />
                Importar
              </Button>
              <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={onImport} aria-label="Importar programa (.json)" />
            </>
          }
        >
          <BlocklyEditor initial={initial} programKey={programKey} onChange={onChange} errors={errors} activeBlockId={activeStep?.blockId ?? null} />
          <p className="mt-2 text-xs text-muted">O programa é salvo automaticamente neste navegador. Arraste blocos da caixa à esquerda e encaixe embaixo de “ao iniciar”.</p>
        </Card>

        <div className="min-w-0 space-y-5">
          <Card title="Prévia">
            <PlatformViewer
              source={running ? 'auto' : 'target'}
              followMotion={running}
              target={previewPose}
              title="Prévia"
              targetLabel={running ? 'Comandada' : 'Prévia'}
              hideTitle
              expandable
              showTable={false}
              canvasClassName="h-72"
            />
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <Button variant="primary" onClick={clock.toggle} disabled={!ok || compiled.duration <= 0} aria-pressed={clock.playing}>
                {clock.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
                {clock.playing ? 'Pausar prévia' : 'Prévia no modelo'}
              </Button>
              <Button variant="ghost" onClick={() => clock.seek(0)} disabled={clock.time === 0}>
                <ListRestart aria-hidden />
                Início
              </Button>
              <p className="ml-auto text-sm tabular-nums text-muted">
                {mmss(clock.time)} / {mmss(compiled.duration)}
              </p>
            </div>
            <div className="mt-3">
              <SliderField label="Instante" value={clock.time} onValueChange={clock.seek} min={0} max={Math.max(compiled.duration, 0.05)} step={0.05} unit="s" unitSpoken="segundos" digits={2} />
            </div>
          </Card>

          <Card title="Passos" description="O mesmo programa em texto (também lido pelos leitores de tela).">
            {compiled.steps.length ? (
              <ol className="space-y-0.5 text-sm" aria-label="Passos do programa">
                {compiled.steps.map((s, i) => (
                  <li
                    key={i}
                    aria-current={activeStep === s ? 'step' : undefined}
                    className={cn('rounded-md px-2 py-1', activeStep === s && 'bg-success-soft font-medium')}
                    style={{ paddingLeft: `${0.5 + s.depth * 1.25}rem` }}
                  >
                    <span className="mr-2 inline-block w-14 tabular-nums text-muted">{fmt(s.t0, 1)} s</span>
                    {s.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Nenhum passo ainda.</p>
            )}
          </Card>

          <Card title="Na plataforma" icon={<Send aria-hidden />} actions={ok && check ? <StatusPill tone={!check.valid ? 'danger' : check.tooFast ? 'warning' : 'success'}>{!check.valid ? 'Fora do curso' : check.tooFast ? 'Rápido' : 'Viável'}</StatusPill> : <StatusPill tone="danger">Com erro</StatusPill>}>
            <div className="space-y-4">
              {!ok && (
                <Alert tone="danger" title="O programa tem erro">
                  {compiled.errors[0].message} O bloco com problema mostra um aviso (⚠).
                </Alert>
              )}
              {ok && check && !check.valid && <Alert tone="danger" title="Fora do curso">{errors[0]?.message} O bloco desse instante mostra um aviso.</Alert>}
              {ok && check?.valid && check.tooFast && (
                <Alert tone="warning" title="Rápido demais para os atuadores">
                  Pico de {fmt(check.peakSpeed, 1)} mm/s (sustentam ~{ACTUATOR_SPEED_MM_S} mm/s). Aumente as durações dos blocos.
                </Alert>
              )}
              {ok && check?.valid && !check.tooFast && (
                <Alert tone="success" title="Viável">
                  {mmss(compiled.duration)} de movimento, pico de {fmt(check.peakSpeed, 1)} mm/s nos atuadores.
                </Alert>
              )}
              {!canCommand && <Alert tone="info">Conecte o simulador ou a porta serial no topo para reproduzir. A prévia funciona sem conexão.</Alert>}
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={play} disabled={!canCommand || !ok || !check?.valid || running}>
                  <Play aria-hidden />
                  {simulated ? 'Reproduzir no simulador' : 'Reproduzir na plataforma'}
                </Button>
                <Button variant="secondary" onClick={saveAsRecording} disabled={!ok}>
                  <Save aria-hidden />
                  Salvar como gravação
                </Button>
              </div>
            </div>
          </Card>
          <MotionStatusCard />
        </div>
      </div>
    </>
  );
}
