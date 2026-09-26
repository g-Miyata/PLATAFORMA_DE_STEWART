import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gauge, Link2, Link2Off } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Alert, StatusPill, type Tone } from '@/components/ui/status';
import { api } from '@/lib/api';
import { fmt } from '@/lib/pistons';
import type { CueingMode, CueingProfile } from '@/lib/types';
import { useCueing } from '@/stores/cueing';

export const PROFILE_LABEL: Record<CueingProfile, string> = {
  washout: 'Simulador de voo',
  attitude: 'Orientação do avião',
};

const MODE: Record<CueingMode, { tone: Tone; text: string }> = {
  off: { tone: 'neutral', text: 'Só visualização' },
  engaging: { tone: 'warning', text: 'Engatando…' },
  on: { tone: 'success', text: 'Plataforma engatada' },
  releasing: { tone: 'warning', text: 'Voltando ao neutro…' },
};

/** Status do motor (compartilhado entre os cartões da página). */
export function useCueingStatus() {
  return useQuery({ queryKey: ['cueing-status'], queryFn: api.cueingStatus, refetchInterval: 1000 });
}

/** Engatar/soltar a plataforma com o perfil desta tela. */
export function PlatformCard({ profile }: { profile: CueingProfile }) {
  const qc = useQueryClient();
  const status = useCueingStatus();
  const tick = useCueing((s) => s.tick);
  const activeProfile = tick?.profile ?? status.data?.profile ?? profile;
  const mode = tick?.mode ?? status.data?.mode ?? 'off';
  // a outra tela está com a plataforma: aqui só mostra
  const otherOwns = mode !== 'off' && activeProfile !== profile;
  const shownMode: CueingMode = otherOwns ? 'off' : mode;
  const engaged = shownMode === 'on' || shownMode === 'engaging';
  const pose = activeProfile === profile ? tick?.pose : undefined;

  async function act(fn: () => Promise<unknown>, ok: string) {
    try {
      await fn();
      toast.success(ok);
    } catch (err) {
      toast.error('Falhou', { description: (err as Error).message });
    } finally {
      qc.invalidateQueries({ queryKey: ['cueing-status'] });
    }
  }

  return (
    <Card title="Plataforma" icon={<Gauge aria-hidden />} actions={<StatusPill tone={MODE[shownMode].tone}>{MODE[shownMode].text}</StatusPill>}>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          onClick={() => act(() => api.cueingEngage(profile), 'Engatando a plataforma')}
          disabled={engaged || otherOwns || !status.data?.serial_open || !!status.data?.conflict}
        >
          <Link2 aria-hidden />
          Engatar
        </Button>
        <Button variant="secondary" onClick={() => act(api.cueingRelease, 'Soltando a plataforma')} disabled={otherOwns || shownMode === 'off' || shownMode === 'releasing'}>
          <Link2Off aria-hidden />
          Soltar
        </Button>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm tabular-nums">
        {(['roll', 'pitch', 'yaw', 'x', 'y', 'z'] as const).map((k) => (
          <div key={k} className="rounded-lg bg-surface-2 px-2 py-1.5">
            <dt className="text-xs uppercase text-muted">{k}</dt>
            <dd className="font-semibold">{pose ? fmt(pose[k], 1, ['x', 'y', 'z'].includes(k) ? ' mm' : '°') : '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
        {!otherOwns && tick?.limited && <StatusPill tone="warning">Limitador de velocidade atuando</StatusPill>}
        {!otherOwns && tick?.clipped && <StatusPill tone="warning">Pose encolhida para caber no curso</StatusPill>}
      </div>
      {otherOwns && (
        <Alert tone="warning" className="mt-4">
          A plataforma está engatada pela tela {PROFILE_LABEL[activeProfile]}. Solte por lá para usar esta.
        </Alert>
      )}
      {status.data && !status.data.serial_open && (
        <Alert tone="info" className="mt-4">
          Sem serial: tudo roda e aparece no 3D, mas nada se move. Conecte a bancada ou o simulador no topo para engatar.
        </Alert>
      )}
      {status.data?.conflict && (
        <Alert tone="warning" className="mt-4">
          Não dá para engatar agora: {status.data.conflict}.
        </Alert>
      )}
    </Card>
  );
}
