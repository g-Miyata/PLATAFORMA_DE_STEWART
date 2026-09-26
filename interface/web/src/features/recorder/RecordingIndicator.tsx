import { Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { mmss } from '@/features/routines/MotionStatusCard';
import { useRecorder } from './recorderStore';

/** "● REC mm:ss" no cabeçalho enquanto o gravador global está ligado, em qualquer página. */
export function RecordingIndicator() {
  const status = useRecorder((s) => s.status);
  const startedAt = useRecorder((s) => s.startedAt);
  const [now, setNow] = useState(() => Date.now());
  const navigate = useNavigate();

  useEffect(() => {
    if (status !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [status]);

  // parou sozinho no limite de 30 min
  useEffect(
    () =>
      useRecorder.subscribe((s, prev) => {
        if (s.truncated && !prev.truncated) toast.warning('Gravação encerrada no limite de 30 minutos', { description: 'Ela foi salva em Gravar e reproduzir.' });
      }),
    [],
  );

  if (status !== 'recording' || !startedAt) return null;

  function stop() {
    const rec = useRecorder.getState().stop();
    if (!rec) return toast.info('Nada foi gravado', { description: 'Nenhuma pose foi aplicada durante a gravação.' });
    toast.success('Gravação salva', {
      description: `${rec.keys.length} poses-chave`,
      action: { label: 'Abrir', onClick: () => navigate('/gravar') },
    });
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-danger/40 bg-danger/10 py-1 pl-3 pr-1 text-sm font-semibold text-danger">
      <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-danger motion-reduce:animate-none" />
      <span role="status">
        <span className="sr-only">Gravação em andamento, </span>
        REC <span className="tabular-nums">{mmss(Math.max(0, (now - startedAt) / 1000))}</span>
      </span>
      <Button size="sm" variant="ghost" className="h-7 px-2 text-danger" onClick={stop}>
        <Square aria-hidden />
        Parar
      </Button>
    </div>
  );
}
