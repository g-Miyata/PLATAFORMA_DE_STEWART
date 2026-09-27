import { CloudOff, Cpu, Monitor, PlugZap } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useConnectionMode, type ConnectionMode } from '@/stores/connection';

const MODES: Record<ConnectionMode, { label: string; hint: string; className: string; Icon: typeof Cpu }> = {
  simulated: {
    label: 'Simulação',
    hint: 'Comandos vão para a plataforma virtual; nenhum hardware se move.',
    className: 'bg-info-soft text-info border-info',
    Icon: Monitor,
  },
  hardware: {
    label: 'Hardware real',
    hint: 'Comandos movem a plataforma física.',
    className: 'bg-danger text-on-danger border-danger',
    Icon: Cpu,
  },
  disconnected: {
    label: 'Desconectado',
    hint: 'Conecte uma porta serial ou o simulador.',
    className: 'bg-surface-2 text-muted border-border-strong',
    Icon: PlugZap,
  },
  offline: {
    label: 'Backend offline',
    hint: 'O servidor FastAPI não responde. Rode o start.bat.',
    className: 'bg-danger-soft text-danger border-danger',
    Icon: CloudOff,
  },
};

/** Selo sempre visível: deixa claro se o hardware vai se mover. */
export function ModeBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  const mode = useConnectionMode();
  const m = MODES[mode];
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center', className)}>
      <span
        title={m.hint}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md border-2 px-2.5 py-1 text-xs font-bold uppercase tracking-wide',
          m.className,
        )}
      >
        <m.Icon aria-hidden className="size-4" />
        {compact ? <span className="hidden min-[520px]:inline">{m.label}</span> : m.label}
        {compact && <span className="sr-only min-[520px]:hidden">{m.label}</span>}
        <span className="sr-only">. {m.hint}</span>
      </span>
    </div>
  );
}
