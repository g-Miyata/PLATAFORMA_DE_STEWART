import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/ui/status';
import { useCanCommand } from '@/features/control/useControlGate';
import { PRESETS } from '@/features/routines/routines';
import { api } from '@/lib/api';
import type { MotionStatus } from '@/lib/types';

const ROUTINE_NAMES: Record<string, string> = Object.fromEntries(PRESETS.map((p) => [p.routine + (p.axis ?? ''), p.title]));

export function mmss(s: number) {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function describe(s: MotionStatus | undefined) {
  if (!s?.routine) return null;
  if (s.routine === 'trajectory') return s.name ?? 'Trajetória';
  return ROUTINE_NAMES[s.routine + (s.params?.axis ?? '')] ?? s.routine;
}

/** Status da rotina/trajetória em execução no backend, com o botão de parar. */
export function useMotionStatus() {
  const canCommand = useCanCommand();
  return useQuery({ queryKey: ['motion-status'], queryFn: api.motionStatus, refetchInterval: 500, enabled: canCommand });
}

export function MotionStatusCard() {
  const qc = useQueryClient();
  const status = useMotionStatus();
  const s = status.data;
  const running = !!s?.running;
  const duration = s?.duration_s ?? s?.params?.duration_s ?? 0;
  const name = describe(s);

  async function stop() {
    try {
      await api.motionStop();
      toast.info('Rotina parada', { description: 'A plataforma voltou ao home.' });
    } catch (err) {
      toast.error('Erro ao parar', { description: (err as Error).message });
    } finally {
      qc.invalidateQueries({ queryKey: ['motion-status'] });
    }
  }

  return (
    <Card
      title="Execução"
      icon={<Gauge aria-hidden />}
      actions={running ? <StatusPill tone="info">Rodando</StatusPill> : <StatusPill tone="neutral">Parada</StatusPill>}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm" aria-live="polite">
          {running && name ? (
            <>
              <span className="font-semibold">{name}</span> · <span className="tabular-nums">{mmss(s!.elapsed)}</span>
              {duration > 0 && <span className="text-muted tabular-nums"> de {mmss(duration)}</span>}
            </>
          ) : (
            <span className="text-muted">Nada em execução.</span>
          )}
        </p>
        <Button variant="danger" onClick={stop} disabled={!running}>
          <Square aria-hidden />
          Parar e voltar ao home
        </Button>
      </div>
      {running && duration > 0 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.min(100, (s!.elapsed / duration) * 100)}%` }} />
        </div>
      )}
    </Card>
  );
}

