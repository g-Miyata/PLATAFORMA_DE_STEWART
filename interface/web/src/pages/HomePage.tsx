import {
  ArrowDown,
  ArrowRight,
  Box,
  Check,
  Copy,
  Cpu,
  Globe,
  Monitor,
  MoveVertical,
  Pause,
  Play,
  Plug,
  Radio,
  Server,
  type LucideIcon,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { NAV } from '@/app/nav';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { MOVES } from '@/features/landing/showcase';
import { useGeometry } from '@/features/platform3d/geometry';
import { refreshSerialStatus } from '@/features/serial/status';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useConnection } from '@/stores/connection';
import { useUi } from '@/stores/ui';

// o canvas (three + pós-processamento) carrega separado: o texto aparece na hora
const ShowcaseCanvas = lazy(() => import('@/features/landing/ShowcaseCanvas').then((m) => ({ default: m.ShowcaseCanvas })));

const prefersReducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STATS = [
  { value: '6', label: 'graus de liberdade' },
  { value: '180 mm', label: 'de curso por atuador' },
  { value: '30 Hz', label: 'de telemetria' },
  { value: '±15°', label: 'de inclinação' },
];

const FLOW: { Icon: LucideIcon; title: string; text: string }[] = [
  { Icon: Globe, title: 'Interface web', text: 'React e modelo 3D. Você monta a pose, dirige pelo joystick ou dispara rotinas.' },
  { Icon: Server, title: 'Backend FastAPI', text: 'Cinemática inversa e direta, validação do curso e rotinas a 60 Hz.' },
  { Icon: Cpu, title: 'ESP32-S3', text: 'PID de cada pistão com feedforward e filtro anti-spike; telemetria a 30 Hz.' },
  { Icon: MoveVertical, title: 'Atuadores lineares', text: 'Seis pistões de 180 mm com realimentação por potenciômetro.' },
];

const SIDE_FLOW: { Icon: LucideIcon; title: string; text: string }[] = [
  { Icon: Radio, title: 'IMU por ESP-NOW', text: 'BNO085 ou MPU-6050 sem fio: a plataforma copia a orientação do sensor.' },
  { Icon: Monitor, title: 'Simulador', text: 'Dispositivo virtual com a dinâmica medida dos atuadores: tudo funciona sem hardware.' },
];

const FEATURES: Record<string, string[]> = {
  '/atuadores': ['Setpoints individuais e globais', 'Gráficos ao vivo e exportação CSV', 'Comando manual e console serial'],
  '/bancada-3d': ['Modelo premium em tela cheia', 'Arraste um pistão ou gire o tampo', 'Cinemática direta e inversa ao vivo'],
  '/cinematica': ['Pose em 6 eixos com validação', 'Calculada × real lado a lado', 'Aplicar automático a 10 Hz'],
  '/joystick': ['Xbox e PlayStation', 'Joystick virtual sem gamepad', 'Limites de ±30 mm e ±8°'],
  '/rotinas': ['Senoide, círculo, hélice e onda', 'Estimativa de velocidade dos atuadores', 'Comandado × medido e CSV'],
  '/acelerometro': ['BNO085 ou MPU-6050', 'IMU virtual para simular', 'Escala e recalibração'],
  '/configuracoes': ['Kp, Ki e Kd por pistão', 'Zona morta e PWM mínimo', 'Feedforward e offset'],
  '/simulacao-voo': ['Ponte Telnet com o FlightGear', 'Limite de ±12°', 'Prévia antes de mover'],
};

const GUIDES: { title: string; steps: { text: string; code?: string }[] }[] = [
  {
    title: 'Início rápido',
    steps: [
      { text: 'Na raiz do projeto, rode:', code: '.\\start.bat' },
      { text: 'A interface abre sozinha em http://localhost:8001/.' },
      { text: 'Sem hardware? Escolha Simulador no topo e conecte.' },
      { text: 'Com o ESP32-S3 no USB, escolha a porta COM dele e confirme.' },
    ],
  },
  {
    title: 'Backend manual',
    steps: [
      { text: 'Na pasta do backend, com o ambiente virtual:', code: 'cd interface\\backend\n.venv\\Scripts\\python.exe app.py' },
      { text: 'Abra http://localhost:8001/ no navegador.' },
      { text: 'A documentação da API fica em /docs.' },
    ],
  },
  {
    title: 'Simulação de voo',
    steps: [
      { text: 'Abra o FlightGear com o Telnet:', code: 'fgfs --telnet=socket,bi,60,localhost,5050,tcp' },
      { text: 'Em outro terminal, rode a ponte:', code: 'cd interface\\simulation\npython fg-bridge.py' },
      { text: 'Na página Simulação de voo, clique em Liberar controle.' },
    ],
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  }
  return (
    <div className="relative mt-2">
      {/* quebra a linha em vez de rolar: sem região rolável inacessível pelo teclado */}
      <pre className="whitespace-pre-wrap break-all rounded-lg border border-border bg-surface-2 py-2.5 pl-3 pr-12 font-mono text-xs">{code}</pre>
      <Button size="icon" variant="ghost" className="absolute right-1 top-1 size-8 bg-surface-2" onClick={copy} aria-label={copied ? 'Copiado' : 'Copiar comando'}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </div>
  );
}

function ConnectSimulator() {
  const serial = useConnection((s) => s.serial);
  const online = useConnection((s) => s.backendOnline !== false);
  const [busy, setBusy] = useState(false);
  if (serial.connected) {
    return <StatusPill tone={serial.simulated ? 'info' : 'danger'}>{serial.simulated ? 'Simulador conectado' : `Hardware em ${serial.port}`}</StatusPill>;
  }
  return (
    <Button
      size="lg"
      variant="outline"
      disabled={busy || !online}
      onClick={async () => {
        setBusy(true);
        try {
          await api.openSerial('SIMULADOR');
          toast.success('Simulador conectado', { description: 'Nenhum hardware vai se mover.' });
        } catch (err) {
          toast.error('Não foi possível conectar', { description: (err as Error).message });
        } finally {
          await refreshSerialStatus();
          setBusy(false);
        }
      }}
    >
      <Plug aria-hidden />
      Conectar o simulador
    </Button>
  );
}

function SectionTitle({ id, eyebrow, title, text }: { id: string; eyebrow: string; title: string; text?: string }) {
  return (
    <div className="mb-8 max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-text">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {text && <p className="mt-2 text-muted">{text}</p>}
    </div>
  );
}

export default function HomePage() {
  const geometry = useGeometry();
  const theme = useUi((s) => s.theme);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const [moveIndex, setMoveIndex] = useState(0);
  const move = MOVES[moveIndex];

  useEffect(() => {
    document.title = 'Plataforma de Stewart · IFSP';
  }, []);

  const background = useMemo(() => {
    void theme;
    return getComputedStyle(document.documentElement).getPropertyValue('--c-scene-bg').trim() || '#101010';
  }, [theme]);

  return (
    <div className="-mx-4 -mt-5 sm:-mx-6 lg:-mx-8">
      {/* ---------- topo: apresentação + modelo em movimento ---------- */}
      <section
        aria-labelledby="titulo-inicio"
        className="relative grid min-h-[calc(100dvh-57px)] overflow-hidden lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        style={{ background }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 size-[36rem] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--c-brand), transparent 65%)' }}
        />
        <div className="relative z-10 flex flex-col justify-center gap-7 px-5 py-10 sm:px-10 lg:py-16 lg:pl-12 xl:pl-16">
          <div className="flex items-center gap-4">
            <img src="/brand/ifsp-logo-texto-escuro.svg" alt="" className="logo-for-light h-11 w-auto" />
            <img src="/brand/ifsp-logo-texto-claro.svg" alt="" className="logo-for-dark h-11 w-auto" />
            <span className="sr-only">Instituto Federal de São Paulo, Campus São José dos Campos</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-text">Trabalho de Conclusão de Curso · Engenharia de Controle e Automação</p>
            <h1 id="titulo-inicio" className="mt-3 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl xl:text-6xl">
              Plataforma de <span className="text-brand-text">Stewart</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted sm:text-lg">
              Bancada de seis graus de liberdade com controle PID embarcado no ESP32-S3, cinemática em tempo real, simulador virtual calibrado com os
              ensaios reais e integração com o FlightGear.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/bancada-3d"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-5 text-base font-semibold text-on-primary shadow-lg transition-colors hover:bg-primary-hover [&_svg]:size-5"
            >
              <Box aria-hidden />
              Explorar a Bancada 3D
            </Link>
            <ConnectSimulator />
            <a href="#como-funciona" className="inline-flex h-12 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted hover:text-fg">
              Como funciona
              <ArrowDown aria-hidden className="size-4" />
            </a>
          </div>
          <dl className="grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="glass rounded-xl border border-border px-3 py-2.5">
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-xl font-bold tabular-nums">{s.value}</span>
                  <span aria-hidden className="text-xs text-muted">
                    {s.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            <span className="font-semibold text-fg">Guilherme Miyata Meirelles</span> · orientação de Anderson Kenji Hirata · coorientação de Carlos Eduardo
            Oliveira da Silva
          </p>
        </div>

        {/* modelo 3D */}
        <div className="relative min-h-[26rem] lg:min-h-0">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-24 lg:block"
            style={{ background: `linear-gradient(to right, ${background}, transparent)` }}
          />
          <div
            role="img"
            aria-label={`Demonstração animada do modelo 3D da bancada. ${playing ? `Movimento atual: ${move.name}, ${move.description}.` : 'Animação pausada.'}`}
            className="absolute inset-0"
          >
            <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted">Carregando o modelo 3D…</div>}>
              <ShowcaseCanvas geometry={geometry} playing={playing} background={background} onMove={setMoveIndex} />
            </Suspense>
          </div>
          <div className="glass absolute inset-x-4 bottom-4 flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2 sm:left-auto sm:right-6 sm:max-w-md">
            <Button
              size="icon"
              variant="secondary"
              onClick={() => setPlaying((p) => !p)}
              aria-pressed={!playing}
              aria-label={playing ? 'Pausar animação' : 'Retomar animação'}
            >
              {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
            </Button>
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="text-xs uppercase tracking-wide text-muted">{playing ? 'Demonstração' : 'Pausado'}</p>
              <p className="truncate text-sm font-semibold">
                {playing ? `${move.name} · ${move.description}` : 'Arraste para girar o modelo'}
              </p>
            </div>
            <div aria-hidden className="flex gap-1">
              {MOVES.map((m, i) => (
                <span key={m.name} className={cn('h-1.5 rounded-full transition-all', i === moveIndex && playing ? 'w-5 bg-brand' : 'w-1.5 bg-border-strong')} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl space-y-20 px-4 py-16 sm:px-6 lg:px-8">
        {/* ---------- como funciona ---------- */}
        <section aria-labelledby="como-funciona">
          <SectionTitle
            id="como-funciona"
            eyebrow="Arquitetura"
            title="Como funciona"
            text="Do clique na interface ao movimento do pistão, em quatro camadas. A IMU e o simulador entram pelas laterais."
          />
          <ol className="grid gap-3 lg:grid-cols-4">
            {FLOW.map(({ Icon, title, text }, i) => (
              <li key={title} className="relative">
                <div className="h-full rounded-xl border border-border bg-surface p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-lg bg-success-soft text-brand-text [&_svg]:size-5">
                      <Icon aria-hidden />
                    </span>
                    <span className="text-xs font-semibold text-muted">
                      <span className="sr-only">Etapa </span>
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                </div>
                {i < FLOW.length - 1 && (
                  <>
                    <ArrowRight aria-hidden className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 text-brand lg:block" />
                    <ArrowDown aria-hidden className="mx-auto my-1 size-5 text-brand lg:hidden" />
                  </>
                )}
              </li>
            ))}
          </ol>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {SIDE_FLOW.map(({ Icon, title, text }) => (
              <li key={title} className="flex gap-4 rounded-xl border border-dashed border-border-strong p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-info-soft text-info [&_svg]:size-5">
                  <Icon aria-hidden />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- interfaces ---------- */}
        <section aria-labelledby="interfaces">
          <SectionTitle id="interfaces" eyebrow="Interfaces" title="Escolha como controlar" text="Todas funcionam com o simulador ou com a bancada real." />
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {NAV.filter((n) => n.path !== '/').map(({ path, label, description, Icon }) => (
              <li key={path}>
                <Link
                  to={path}
                  className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-success-soft text-brand-text [&_svg]:size-6">
                    <Icon aria-hidden />
                  </span>
                  <span className="mt-4 flex items-center gap-1.5 font-semibold">
                    {label}
                    <ArrowRight aria-hidden className="size-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                  </span>
                  <span className="mt-1 text-sm text-muted">{description}</span>
                  {FEATURES[path] && (
                    <ul className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
                      {FEATURES[path].map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- guias ---------- */}
        <section aria-labelledby="primeiros-passos">
          <SectionTitle id="primeiros-passos" eyebrow="Guias" title="Primeiros passos" />
          <div className="grid gap-4 lg:grid-cols-3">
            {GUIDES.map((g) => (
              <article key={g.title} className="rounded-xl border border-border bg-surface p-5 shadow-card">
                <h3 className="font-semibold">{g.title}</h3>
                <ol className="mt-4 space-y-4">
                  {g.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-sm">
                      <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p>{s.text}</p>
                        {s.code && <CodeBlock code={s.code} />}
                      </div>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>

        {/* ---------- sobre ---------- */}
        <section aria-labelledby="sobre" className="grid gap-6 rounded-2xl border border-border bg-surface p-6 shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-8">
          <div>
            <SectionTitle id="sobre" eyebrow="Projeto" title="Sobre" />
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Autor</dt>
              <dd className="font-medium">Guilherme Miyata Meirelles</dd>
              <dt className="text-muted">Orientador</dt>
              <dd className="font-medium">Anderson Kenji Hirata</dd>
              <dt className="text-muted">Coorientador</dt>
              <dd className="font-medium">Carlos Eduardo Oliveira da Silva</dd>
              <dt className="text-muted">Instituição</dt>
              <dd className="font-medium">IFSP · Campus São José dos Campos · 2025</dd>
            </dl>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Tecnologias</h3>
            <ul className="mt-3 flex flex-wrap gap-2 text-sm">
              {['React', 'TypeScript', 'Three.js', 'Tailwind CSS', 'FastAPI', 'Python', 'ESP32-S3', 'ESP-NOW', 'BNO085', 'MATLAB', 'FlightGear'].map((t) => (
                <li key={t} className="rounded-full border border-border bg-surface-2 px-3 py-1">
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 flex flex-wrap gap-4 text-sm">
              <a className="font-medium text-brand-text underline" href="/docs" target="_blank" rel="noreferrer">
                Documentação da API
              </a>
              <a className="font-medium text-brand-text underline" href="https://github.com/g-Miyata" target="_blank" rel="noreferrer">
                GitHub do autor
              </a>
              <a className="font-medium text-brand-text underline" href="/antigo/">
                Interface antiga
              </a>
            </p>
          </div>
        </section>

        <footer className="border-t border-border pt-6 text-center text-xs text-muted">Guilherme Miyata · TCC · Engenharia de Controle e Automação · IFSP · 2025</footer>
      </div>
    </div>
  );
}
