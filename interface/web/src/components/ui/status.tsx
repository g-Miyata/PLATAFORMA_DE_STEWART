import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const toneClass: Record<Tone, string> = {
  success: 'bg-success-soft text-brand-text border-brand/40',
  danger: 'bg-danger-soft text-danger border-danger/40',
  warning: 'bg-warning-soft text-warning border-warning/40',
  info: 'bg-info-soft text-info border-info/40',
  neutral: 'bg-surface-2 text-muted border-border',
};

const toneIcon: Record<Tone, ReactNode> = {
  success: <CheckCircle2 aria-hidden />,
  danger: <XCircle aria-hidden />,
  warning: <AlertTriangle aria-hidden />,
  info: <Info aria-hidden />,
  neutral: <Info aria-hidden />,
};

/** Estado com ícone + texto: nunca só cor (WCAG 1.4.1). */
export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5',
        toneClass[tone],
        className,
      )}
    >
      {toneIcon[tone]}
      {children}
    </span>
  );
}

export function Alert({ tone, title, children, className }: { tone: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0', toneClass[tone], className)}
    >
      {toneIcon[tone]}
      <div className="min-w-0 text-fg">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-muted')}>{children}</div>}
      </div>
    </div>
  );
}
