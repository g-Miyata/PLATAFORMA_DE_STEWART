import { ListTree, Terminal } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import type { CueingProfile } from '@/lib/types';
import { useCueingStatus } from './PlatformCard';

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs">{children}</pre>;
}

export function EventsCard() {
  const status = useCueingStatus();
  const events = [...(status.data?.events ?? [])].reverse().slice(0, 6);
  return (
    <Card title="Eventos" icon={<ListTree aria-hidden />}>
      {events.length === 0 ? (
        <p className="text-sm text-muted">Nada ainda.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {events.map((e) => (
            <li key={e.ts + e.text} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-muted">{new Date(e.ts * 1000).toLocaleTimeString('pt-BR')}</span>
              <span className={e.tone === 'danger' ? 'text-danger' : e.tone === 'warning' ? 'text-warning' : undefined}>{e.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Voar ao vivo (física ligada) em vez de tocar um voo gravado. */
export function LiveHowToCard() {
  return (
    <Card title="Voar ao vivo com o FlightGear" icon={<Terminal aria-hidden />}>
      <ol className="list-decimal space-y-3 pl-5 text-sm">
        <li>
          Abra o FlightGear com a física ligada e a saída UDP (ERJ145 do IFSP no SBGR):
          <Code>{'powershell -File interface\\simulation\\start-flightgear-cueing.ps1'}</Code>
        </li>
        <li>
          Em outro terminal, com o backend rodando:
          <Code>{'cd interface\\simulation\npython fg-bridge.py --cueing'}</Code>
        </li>
        <li>Na aba Ao vivo, confira “Recebendo do FlightGear”, engate e voe (ou grave o voo).</li>
        <li>
          Para o avião voar sozinho a rotina de demonstração: <code className="font-mono">python fly-demo.py</code> na mesma pasta.
        </li>
      </ol>
      <p className="mt-3 text-xs text-muted">
        O botão Rodar no FlightGear é outra coisa: abre o simulador sem física só para mostrar um voo gravado. Passo a passo completo e erros comuns em
        FLIGHTGEAR-SETUP.md.
      </p>
    </Card>
  );
}

/** Fechar a aba não pode deixar o FlightGear mandando na plataforma (só se esta tela for a dona). */
export function useReleaseOnLeave(profile: CueingProfile) {
  const status = useCueingStatus();
  const owner = useRef<CueingProfile | null>(null);
  useEffect(() => {
    owner.current = status.data && status.data.mode !== 'off' ? status.data.profile : null;
  }, [status.data]);
  useEffect(() => {
    const release = (e: PageTransitionEvent) => {
      if (owner.current !== profile) return;
      // o motivo aparece nos eventos: dá para saber se foi o botão ou a página saindo
      const reason = e.persisted ? 'pagina-cache' : 'pagina';
      navigator.sendBeacon?.(`/cueing/release?reason=${reason}&origin=${encodeURIComponent(location.host + location.pathname)}`);
    };
    window.addEventListener('pagehide', release);
    return () => window.removeEventListener('pagehide', release);
  }, [profile]);
}
