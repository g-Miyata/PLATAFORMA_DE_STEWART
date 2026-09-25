import { Send, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inputClass } from '@/components/ui/field';
import { useCanCommand } from '@/features/control/useControlGate';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useTelemetry, type LogEntry } from '@/stores/telemetry';

const DIR_CLASS: Record<LogEntry['dir'], string> = {
  rx: 'text-fg',
  tx: 'text-info',
  info: 'text-brand-text',
  error: 'text-danger',
};
const DIR_LABEL: Record<LogEntry['dir'], string> = { rx: 'RX', tx: 'TX', info: '--', error: 'ERR' };

const isEcho = (e: LogEntry) => e.dir === 'rx' && /^OK spmm6x aplicado/.test(e.text);

export function SerialConsole() {
  const log = useTelemetry((s) => s.log);
  const clear = useTelemetry((s) => s.clearLog);
  const pushLog = useTelemetry((s) => s.pushLog);
  const canCommand = useCanCommand();
  const [command, setCommand] = useState('');
  const [hideEcho, setHideEcho] = useState(true);
  const box = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => (hideEcho ? log.filter((e) => !isEcho(e)) : log).slice(-250), [log, hideEcho]);

  useEffect(() => {
    const el = box.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [shown]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd) return;
    try {
      await api.sendCommand(cmd);
      pushLog('tx', cmd);
      setCommand('');
    } catch (err) {
      toast.error('Comando não enviado', { description: (err as Error).message });
    }
  }

  return (
    <Card
      title="Console serial"
      description="Mensagens do ESP32 (ou do simulador) e comandos enviados."
      actions={
        <>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={hideEcho} onChange={(e) => setHideEcho(e.target.checked)} className="size-4 accent-[var(--c-primary)]" />
            Ocultar confirmações de setpoint
          </label>
          <Button size="sm" variant="ghost" onClick={clear}>
            <Trash2 aria-hidden />
            Limpar
          </Button>
        </>
      }
    >
      <div
        ref={box}
        role="log"
        aria-live="off"
        // região rolável precisa receber foco para ser lida/rolada pelo teclado (axe: scrollable-region-focusable)
        aria-label="Mensagens da serial"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="h-56 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2 font-mono text-xs"
      >
        {shown.length === 0 ? (
          <p className="text-muted">Nenhuma mensagem ainda.</p>
        ) : (
          shown.map((e) => (
            <div key={e.id} className={cn('whitespace-pre-wrap break-all', DIR_CLASS[e.dir])}>
              <span className="text-muted">{new Date(e.ts).toLocaleTimeString('pt-BR')} </span>
              <span className="font-semibold">{DIR_LABEL[e.dir]}</span> {e.text}
            </div>
          ))
        )}
      </div>
      <form onSubmit={send} className="mt-3 flex gap-2">
        <label htmlFor="cmd-livre" className="sr-only">
          Comando livre
        </label>
        <input
          id="cmd-livre"
          className={cn(inputClass, 'font-mono')}
          placeholder="ex.: sel=1  ·  kpmm=5.2  ·  v?"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          disabled={!canCommand}
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={!canCommand || !command.trim()}>
          <Send aria-hidden />
          Enviar
        </Button>
      </form>
    </Card>
  );
}
