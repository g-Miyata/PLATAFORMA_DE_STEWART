import { CheckCircle2, CircleSlash, Send, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { cn } from '@/lib/cn';

type Outcome = 'ok' | 'refused' | 'error';

interface SendState {
  /** último comando que saiu do celular */
  last: { at: number; outcome: Outcome; message?: string } | null;
  /** comandos aplicados nos últimos segundos (para mostrar a taxa) */
  times: number[];
  record: (outcome: Outcome, message?: string) => void;
}

const WINDOW_MS = 2000;

/** Resultado dos comandos enviados pelo celular (aplicado, recusado ou erro). */
export const useSendStatus = create<SendState>((set) => ({
  last: null,
  times: [],
  record: (outcome, message) =>
    set((s) => {
      const now = Date.now();
      const times = outcome === 'ok' ? [...s.times.filter((t) => now - t < WINDOW_MS), now] : s.times;
      return { last: { at: now, outcome, message }, times };
    }),
}));

/** Anota o resultado de uma chamada de pose (applied / message) e devolve o próprio resultado. */
export function noteResult<T extends { applied: boolean; message?: string }>(r: T): T {
  useSendStatus.getState().record(r.applied ? 'ok' : 'refused', r.message);
  return r;
}

export function noteError(err: unknown) {
  useSendStatus.getState().record('error', (err as Error).message);
}

/**
 * Faixa com o que aconteceu com o último comando: dá para saber na hora se ele chegou
 * na plataforma, se foi recusado (e por quê) ou se nada está sendo enviado.
 */
export function SendStatusBar({ className, idleText = 'Nada enviado ainda: inicie um controle.' }: { className?: string; idleText?: string }) {
  const last = useSendStatus((s) => s.last);
  const times = useSendStatus((s) => s.times);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const age = last ? (now - last.at) / 1000 : Infinity;
  const rate = times.filter((t) => now - t < WINDOW_MS).length / (WINDOW_MS / 1000);
  let tone = 'border-border bg-surface-2 text-muted';
  let Icon = CircleSlash;
  let text = idleText;
  if (last && age < 1.5) {
    if (last.outcome === 'ok') {
      tone = 'border-brand/40 bg-success-soft text-brand-text';
      Icon = CheckCircle2;
      text = `Chegando na plataforma${rate >= 1 ? ` · ${Math.round(rate)} por segundo` : ''}`;
    } else {
      tone = 'border-danger/40 bg-danger-soft text-danger';
      Icon = last.outcome === 'refused' ? CircleSlash : XCircle;
      text = `${last.outcome === 'refused' ? 'Recusado' : 'Não chegou'}: ${last.message ?? 'sem detalhe'}`;
    }
  } else if (last) {
    Icon = Send;
    text = `Parado · último comando há ${age < 60 ? `${Math.round(age)} s` : 'mais de 1 min'}${last.outcome === 'ok' ? '' : ` (${last.message ?? 'erro'})`}`;
  }
  return (
    // muda até 20 vezes por segundo: fica fora da fala do leitor de tela
    <p aria-live="off" className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium', tone, className)}>
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0">{text}</span>
    </p>
  );
}
