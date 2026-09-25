import { ArrowRight, Monitor, Plug, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { NAV } from '@/app/nav';
import { PageHeader } from '@/components/PageLayout';
import { Card } from '@/components/ui/card';
import { PlatformViewer } from '@/features/platform3d/PlatformViewer';

const STEPS = [
  {
    Icon: Monitor,
    title: 'Comece pelo simulador',
    text: 'No topo, escolha "Simulador" e clique em Conectar. A plataforma virtual responde aos mesmos comandos do ESP32, com a dinâmica medida dos atuadores, e nada se move de verdade.',
  },
  {
    Icon: Plug,
    title: 'Depois, o hardware',
    text: 'Com o ESP32-S3 ligado por USB, selecione a porta COM dele e confirme. O selo no topo passa para "Hardware real" em vermelho.',
  },
  {
    Icon: ShieldAlert,
    title: 'Parada de emergência',
    text: 'O botão "Parar" (ou a tecla Esc) interrompe rotinas, joystick e IMU e congela os atuadores na posição atual.',
  },
];

export default function HomePage() {
  return (
    <>
      <PageHeader
        title="Plataforma de Stewart"
        description="Bancada de 6 graus de liberdade do IFSP, Campus São José dos Campos. Controle por cinemática, joystick, IMU, rotinas e simulação de voo, com modelo 3D em tempo real."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,36rem)]">
        <div className="space-y-5">
          <Card title="Primeiros passos">
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map(({ Icon, title, text }, i) => (
                <li key={title} className="rounded-lg border border-border bg-surface-2 p-4">
                  <p className="flex items-center gap-2 font-semibold">
                    <Icon aria-hidden className="size-5 text-brand" />
                    <span>
                      <span className="sr-only">Passo {i + 1}: </span>
                      {title}
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-muted">{text}</p>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Interfaces">
            <ul className="grid gap-3 sm:grid-cols-2">
              {NAV.filter((n) => n.path !== '/').map(({ path, label, description, Icon }) => (
                <li key={path}>
                  <Link
                    to={path}
                    className="group flex h-full items-start gap-3 rounded-lg border border-border p-4 transition-colors hover:border-brand hover:bg-surface-2"
                  >
                    <Icon aria-hidden className="mt-0.5 size-6 shrink-0 text-brand" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 font-semibold">
                        {label}
                        <ArrowRight aria-hidden className="size-4 opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Sobre o projeto" headingLevel={2}>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-muted">Autor</dt>
              <dd className="font-medium">Guilherme Miyata Meirelles</dd>
              <dt className="text-muted">Orientador</dt>
              <dd className="font-medium">Anderson Kenji Hirata</dd>
              <dt className="text-muted">Coorientador</dt>
              <dd className="font-medium">Carlos Eduardo Oliveira da Silva</dd>
              <dt className="text-muted">Instituição</dt>
              <dd className="font-medium">IFSP · Campus São José dos Campos · TCC 2025</dd>
            </dl>
          </Card>
        </div>

        <Card>
          <PlatformViewer title="Plataforma agora" showTable={false} canvasClassName="h-96 sm:h-[30rem]" />
        </Card>
      </div>
    </>
  );
}
