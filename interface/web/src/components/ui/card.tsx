import { useId, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  /** nível do título; as páginas usam h1 no cabeçalho, então o padrão é h2 */
  headingLevel?: 2 | 3;
}

/** Seção com título: vira um landmark "region" nomeado pelo próprio título. */
export function Card({ title, description, icon, actions, headingLevel = 2, className, children, ...props }: CardProps) {
  const id = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={title ? `${id}-title` : undefined}
      className={cn('rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5', className)}
      {...props}
    >
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <Heading id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold [&_svg]:size-5 [&_svg]:text-brand">
                {icon}
                {title}
              </Heading>
            )}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
